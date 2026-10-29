import { createHash, randomUUID } from "node:crypto";
import { Hono } from "hono";
import { getPool } from "../../db/pool.js";
import { getDidDocumentByAgent, getDidDocumentByDid } from "../../repo/did.js";
import { buildPublicVerificationBundle } from "../../transparency/bundle.js";
import { verifyPublicVerificationBundle } from "../../transparency/verify-public.js";

export const publicRoutes = new Hono();

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Scoped read-only auditor portal (Phase 5). */
publicRoutes.get("/auditor/:token", async (c) => {
  const token = c.req.param("token")?.trim();
  if (!token) return c.json({ error: "token required" }, 422);
  const client = await getPool().connect();
  try {
    const invite = await client.query<{
      invite_id: string;
      organization_id: string;
      email: string;
      expires_at: Date;
      revoked_at: Date | null;
      workflow_ids: unknown;
      period_start: Date | null;
      period_end: Date | null;
      org_name: string;
    }>(
      `SELECT i.invite_id, i.organization_id, i.email, i.expires_at, i.revoked_at,
              i.workflow_ids, i.period_start, i.period_end, o.name AS org_name
       FROM auditor_invite i
       JOIN organization o ON o.organization_id = i.organization_id
       WHERE i.token_hash = $1
       LIMIT 1`,
      [hashToken(token)],
    );
    const row = invite.rows[0];
    if (!row || row.revoked_at || row.expires_at < new Date()) {
      return c.json({ error: "Invite invalid or expired" }, 404);
    }

    await client.query(
      `INSERT INTO auditor_access_log (
         log_id, invite_id, organization_id, action, resource_type, resource_id
       ) VALUES ($1,$2,$3,'portal.view','auditor_invite',$2)`,
      [`alog_${randomUUID().replace(/-/g, "").slice(0, 16)}`, row.invite_id, row.organization_id],
    );

    const periodStart = row.period_start ?? new Date(Date.now() - 90 * 86_400_000);
    const periodEnd = row.period_end ?? new Date();
    const traces = await client.query<{
      trace_id: string;
      agent_id: string;
      started_at: Date;
      status: string;
      total_events: number;
    }>(
      `SELECT trace_id, agent_id, started_at, status, total_events
       FROM trace
       WHERE organization_id = $1
         AND started_at >= $2 AND started_at <= $3
       ORDER BY started_at DESC
       LIMIT 50`,
      [row.organization_id, periodStart, periodEnd],
    );

    return c.json({
      portal: {
        organization_name: row.org_name,
        email: row.email,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        workflow_ids: Array.isArray(row.workflow_ids) ? row.workflow_ids : [],
        read_only: true,
      },
      traces: traces.rows.map((t) => ({
        trace_id: t.trace_id,
        agent_id: t.agent_id,
        started_at: t.started_at.toISOString(),
        status: t.status,
        total_events: t.total_events,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("auditor_invite") || message.includes("does not exist")) {
      return c.json({ error: "Auditor portal unavailable" }, 503);
    }
    throw error;
  } finally {
    client.release();
  }
});

publicRoutes.get("/orgs/:slug/transparency/head", async (c) => {
  const slug = c.req.param("slug");
  const client = await getPool().connect();
  try {
    const org = await client.query<{ organization_id: string }>(
      `SELECT organization_id FROM organization WHERE slug = $1`,
      [slug],
    );
    const organizationId = org.rows[0]?.organization_id;
    if (!organizationId) {
      return c.json({ error: "Not found" }, 404);
    }

    const head = await client.query<{
      tree_size: string;
      latest_log_index: string | null;
      latest_leaf_hash: string | null;
      latest_published_at: Date | null;
    }>(
      `SELECT
         COUNT(*)::text AS tree_size,
         MAX(log_index)::text AS latest_log_index,
         (SELECT leaf_hash FROM transparency_log_entry t2
          WHERE t2.organization_id = $1
          ORDER BY log_index DESC LIMIT 1) AS latest_leaf_hash,
         MAX(published_at) AS latest_published_at
       FROM transparency_log_entry
       WHERE organization_id = $1`,
      [organizationId],
    );

    const row = head.rows[0];
    return c.json({
      organization_slug: slug,
      tree_size: Number(row?.tree_size ?? 0),
      latest_log_index:
        row?.latest_log_index != null ? Number(row.latest_log_index) : null,
      latest_leaf_hash: row?.latest_leaf_hash ?? null,
      latest_published_at: row?.latest_published_at ?? null,
    });
  } finally {
    client.release();
  }
});

publicRoutes.get("/orgs/:slug/verify/:eventId", async (c) => {
  const slug = c.req.param("slug");
  const eventId = c.req.param("eventId");
  const client = await getPool().connect();
  try {
    const bundle = await buildPublicVerificationBundle(client, slug, eventId);
    if (!bundle) {
      const org = await client.query<{ organization_id: string }>(
        `SELECT organization_id FROM organization WHERE slug = $1`,
        [slug],
      );
      const organizationId = org.rows[0]?.organization_id;
      if (!organizationId) {
        return c.json({ error: "Organization not found", code: "org_not_found" }, 404);
      }
      const event = await client.query<{ event_id: string }>(
        `SELECT event_id FROM event WHERE organization_id = $1 AND event_id = $2`,
        [organizationId, eventId],
      );
      if (!event.rows[0]) {
        return c.json({ error: "Event not found", code: "event_not_found" }, 404);
      }
      const witnessed = await client.query<{ event_id: string }>(
        `SELECT event_id FROM inclusion_proof
         WHERE organization_id = $1 AND event_id = $2`,
        [organizationId, eventId],
      );
      if (!witnessed.rows[0]) {
        return c.json(
          {
            error:
              "This event is sealed. Witness inclusion is still processing. Try again in about a minute.",
            code: "witness_pending",
          },
          404,
        );
      }
      return c.json(
        {
          error:
            "This event is witnessed. Transparency log publish is still processing. Try again in about a minute.",
          code: "transparency_pending",
        },
        404,
      );
    }
    const includeVerification =
      c.req.query("verify") === "1" || c.req.query("include") === "verification";
    if (includeVerification) {
      return c.json({
        ...bundle,
        verification: verifyPublicVerificationBundle(bundle),
      });
    }
    return c.json(bundle);
  } finally {
    client.release();
  }
});

/**
 * Expiring read-only receipt share (Phase 8).
 * Opaque token → sealed receipt summary without console login.
 */
publicRoutes.get("/share/receipt/:token", async (c) => {
  const token = c.req.param("token")?.trim();
  if (!token) return c.json({ error: "token required" }, 422);

  const client = await getPool().connect();
  try {
    const share = await client.query<{
      share_id: string;
      organization_id: string;
      event_id: string;
      expires_at: Date;
      revoked_at: Date | null;
      org_name: string;
      org_slug: string;
    }>(
      `SELECT s.share_id, s.organization_id, s.event_id, s.expires_at, s.revoked_at,
              o.name AS org_name, o.slug AS org_slug
       FROM receipt_share_token s
       JOIN organization o ON o.organization_id = s.organization_id
       WHERE s.token_hash = $1
       LIMIT 1`,
      [hashToken(token)],
    );
    const row = share.rows[0];
    if (!row || row.revoked_at || row.expires_at < new Date()) {
      return c.json({ error: "Share link invalid or expired" }, 404);
    }

    await client.query(
      `UPDATE receipt_share_token
       SET last_accessed_at = now(), access_count = access_count + 1
       WHERE share_id = $1`,
      [row.share_id],
    );

    const event = await client.query<{
      event_id: string;
      trace_id: string;
      agent_id: string;
      action_kind: string;
      policy_decision: string;
      tool_name: string | null;
      event_hash: string;
      prev_event_hash: string | null;
      chain_valid: boolean;
      emitted_at: Date;
      payload: unknown;
    }>(
      `SELECT event_id, trace_id, agent_id, action_kind, policy_decision, tool_name,
              event_hash, prev_event_hash, chain_valid, emitted_at, payload
       FROM event
       WHERE organization_id = $1 AND event_id = $2
       LIMIT 1`,
      [row.organization_id, row.event_id],
    );
    const ev = event.rows[0];
    if (!ev) {
      return c.json({ error: "Receipt not found" }, 404);
    }

    const payload =
      ev.payload && typeof ev.payload === "object"
        ? (ev.payload as Record<string, unknown>)
        : {};
    const amountRaw = payload.amount_usd ?? payload.amount;
    const amountUsd =
      typeof amountRaw === "number"
        ? amountRaw
        : typeof amountRaw === "string" && amountRaw.trim() !== ""
          ? Number(amountRaw)
          : null;
    const reason =
      (typeof payload.reason === "string" && payload.reason) ||
      (typeof payload.investor_summary === "string" && payload.investor_summary) ||
      null;
    const approver =
      (typeof payload.approver_email === "string" && payload.approver_email) ||
      (typeof payload.approver === "string" && payload.approver) ||
      null;

    let verification: {
      status: "valid" | "pending" | "unavailable";
      detail: string;
    } = {
      status: "unavailable",
      detail: "Public cryptographic bundle not built for this receipt yet.",
    };
    try {
      const bundle = await buildPublicVerificationBundle(
        client,
        row.org_slug,
        row.event_id,
      );
      if (bundle) {
        const checked = verifyPublicVerificationBundle(bundle);
        verification = {
          status: checked.ok ? "valid" : "unavailable",
          detail: checked.ok
            ? "Witness and transparency inclusion verified."
            : checked.errors.join("; ") || "Verification failed.",
        };
      } else {
        verification = {
          status: "pending",
          detail:
            "Seal chain is recorded; witness or transparency inclusion may still be pending.",
        };
      }
    } catch {
      /* keep unavailable */
    }

    return c.json({
      share: {
        share_id: row.share_id,
        expires_at: row.expires_at.toISOString(),
        read_only: true,
        organization_name: row.org_name,
        organization_slug: row.org_slug,
      },
      receipt: {
        event_id: ev.event_id,
        trace_id: ev.trace_id,
        agent_id: ev.agent_id,
        action_kind: ev.action_kind,
        policy_decision: ev.policy_decision,
        tool_name: ev.tool_name,
        event_hash: ev.event_hash,
        prev_event_hash: ev.prev_event_hash,
        chain_valid: ev.chain_valid,
        emitted_at: ev.emitted_at.toISOString(),
        amount_usd: Number.isFinite(amountUsd) ? amountUsd : null,
        reason,
        approver,
        decision:
          (typeof payload.decision === "string" && payload.decision) ||
          ev.policy_decision,
      },
      verification,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("receipt_share_token") ||
      message.includes("does not exist")
    ) {
      return c.json({ error: "Share links unavailable" }, 503);
    }
    throw error;
  } finally {
    client.release();
  }
});

publicRoutes.get("/agents/:agentId/did", async (c) => {
  const agentId = c.req.param("agentId");
  const client = await getPool().connect();
  try {
    const doc = await getDidDocumentByAgent(client, agentId);
    if (!doc) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({
      agent_id: doc.agent_id,
      organization_id: doc.organization_id,
      document: doc.document_json,
      published_at: doc.published_at,
    });
  } finally {
    client.release();
  }
});

publicRoutes.get("/did/:did", async (c) => {
  const did = decodeURIComponent(c.req.param("did"));
  const client = await getPool().connect();
  try {
    const doc = await getDidDocumentByDid(client, did);
    if (!doc) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json(doc.document_json);
  } finally {
    client.release();
  }
});
