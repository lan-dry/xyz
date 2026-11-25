/**
 * Hosted demo tenant (organization.is_demo) endpoints, driven by
 * `pnpm pilot:provision-demo-tenant` over HTTP (no direct database access needed).
 *
 *   GET  /v1/console/organization/profile        any session: { name, slug, is_demo }
 *   POST /v1/console/demo-tenant/setup           admin + is_demo: banking pack + 2-minute escalation config
 *   POST /v1/console/demo-tenant/bank-roles      admin + is_demo: map member emails to bank roles
 *   POST /v1/console/demo-tenant/prepare-v4-dual-publish
 *        admin + is_demo: live draft of active pack with dual_publish_required (runbook §4)
 *
 * Demo-tenant helpers for organization.is_demo only.
 */
import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { auditFromConsoleSession } from "../../console/audit-from-session.js";
import { listBankRoleLadder } from "../../bank/repo.js";
import { getPool } from "../../db/pool.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";
import { applyDemoPack } from "../../packs/apply-pack.js";
import { loadDemoPack } from "../../packs/load.js";
import {
  DEMO_TENANT_ESCALATION,
  isOrganizationDemo,
} from "../../bank/demo-tenant.js";

export const demoTenantRoutes = new Hono<{ Variables: ConsoleVariables }>();

demoTenantRoutes.get("/organization/profile", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  const org = await getPool().query<{
    name: string;
    slug: string;
    require_signed_events: boolean;
    is_test: boolean;
  }>(
    `SELECT name, slug, require_signed_events, COALESCE(is_test, false) AS is_test
       FROM organization WHERE organization_id = $1`,
    [session.organizationId],
  );
  if (!org.rows[0]) return c.json({ error: "Not found" }, 404);
  return c.json({
    organization: {
      organization_id: session.organizationId,
      name: org.rows[0].name,
      slug: org.rows[0].slug,
      is_demo: await isOrganizationDemo(getPool(), session.organizationId),
      is_test: org.rows[0].is_test === true,
      require_signed_events: org.rows[0].require_signed_events === true,
    },
  });
});

demoTenantRoutes.post("/demo-tenant/setup", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (session.role !== "admin") return c.json({ error: "Forbidden" }, 403);
  const pool = getPool();
  if (!(await isOrganizationDemo(pool, session.organizationId))) {
    return c.json(
      { error: "not_demo_org", message: "Only an organisation flagged is_demo may use demo setup." },
      403,
    );
  }
  let force = false;
  try {
    force = ((await c.req.json()) as { force?: boolean })?.force === true;
  } catch {
    /* empty body */
  }
  if (!force) {
    // Idempotent: the same pack with the demo escalation window is already active.
    const current = await pool.query<{ policy_id: string }>(
      `SELECT p.policy_id
         FROM policy p
        WHERE p.organization_id = $1 AND p.status = 'active' AND p.name = $2
          AND EXISTS (
            SELECT 1 FROM policy_rule r
             WHERE r.policy_id = p.policy_id
               AND (r.conditions->'obligations'->>'escalate_after_ms') = $3
          )
        LIMIT 1`,
      [
        session.organizationId,
        loadDemoPack("banking").name,
        String(DEMO_TENANT_ESCALATION.afterMs),
      ],
    );
    if (current.rows[0]) {
      return c.json({
        ok: true,
        already_applied: true,
        policy_id: current.rows[0].policy_id,
        escalate_after_ms: DEMO_TENANT_ESCALATION.afterMs,
      });
    }
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const applied = await applyDemoPack(client, session.organizationId, "banking", {
      escalation: {
        afterMs: DEMO_TENANT_ESCALATION.afterMs,
        toRole: DEMO_TENANT_ESCALATION.toRole,
      },
    });
    await client.query("COMMIT");
    await auditFromConsoleSession(pool, session, {
      action: "demo_tenant.pack_applied",
      resourceType: "policy",
      resourceId: applied.policyId,
      metadata: {
        pack: applied.packId,
        escalation_rules: applied.escalationRules,
        escalate_after_ms: DEMO_TENANT_ESCALATION.afterMs,
      },
    });
    return c.json(
      {
        ok: true,
        policy_id: applied.policyId,
        pack_id: applied.packId,
        escalate_after_ms: DEMO_TENANT_ESCALATION.afterMs,
        escalate_to_role: DEMO_TENANT_ESCALATION.toRole,
        escalation_rules: applied.escalationRules,
      },
      201,
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    const message = err instanceof Error ? err.message : "Failed to apply demo pack";
    console.error("[console] demo-tenant setup", err);
    return c.json({ error: message }, 500);
  } finally {
    client.release();
  }
});

demoTenantRoutes.post("/demo-tenant/bank-roles", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (session.role !== "admin") return c.json({ error: "Forbidden" }, 403);
  const pool = getPool();
  if (!(await isOrganizationDemo(pool, session.organizationId))) {
    return c.json({ error: "not_demo_org" }, 403);
  }
  let body: { assignments?: Array<{ email?: string; role_key?: string }> };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  const assignments = (body.assignments ?? [])
    .map((a) => ({
      email: a.email?.trim().toLowerCase() ?? "",
      role_key: a.role_key?.trim() ?? "",
    }))
    .filter((a) => a.email && a.role_key);
  if (assignments.length === 0) return c.json({ error: "assignments required" }, 422);

  const ladder = await listBankRoleLadder(pool, session.organizationId);
  const known = new Set(ladder.map((r) => r.role_key));
  const unknown = assignments.filter((a) => !known.has(a.role_key));
  if (unknown.length > 0) {
    return c.json(
      { error: "unknown_role", roles: [...new Set(unknown.map((a) => a.role_key))] },
      422,
    );
  }

  const assigned: Array<{ role_key: string }> = [];
  const pending: string[] = [];
  for (const a of assignments) {
    const member = await pool.query<{ membership_id: string }>(
      `SELECT m.membership_id
         FROM membership m JOIN account acc ON acc.account_id = m.account_id
        WHERE m.organization_id = $1 AND lower(acc.email) = $2 AND m.status = 'active'`,
      [session.organizationId, a.email],
    );
    const membershipId = member.rows[0]?.membership_id;
    if (!membershipId) {
      pending.push(a.role_key);
      continue;
    }
    await pool.query(
      `INSERT INTO membership_bank_role (membership_id, organization_id, role_key)
       VALUES ($1, $2, $3)
       ON CONFLICT (membership_id, role_key) DO NOTHING`,
      [membershipId, session.organizationId, a.role_key],
    );
    assigned.push({ role_key: a.role_key });
  }
  // Emails are deliberately not echoed back (or logged): only role keys and counts.
  return c.json({ ok: true, assigned_count: assigned.length, pending_count: pending.length, pending_roles: pending });
});

/**
 * Create a live draft of the active banking pack with dual_publish_required, and
 * optionally elevate a second member to console admin so two people can publish.
 * Used by the runbook walk (DEMO_RUNBOOK §4) — v4 is created in the room, not pre-seeded.
 */
demoTenantRoutes.post(
  "/demo-tenant/prepare-v4-dual-publish",
  requireConsoleSession,
  async (c) => {
    const session = c.get("consoleSession");
    if (session.role !== "admin") return c.json({ error: "Forbidden" }, 403);
    const pool = getPool();
    if (!(await isOrganizationDemo(pool, session.organizationId))) {
      return c.json({ error: "not_demo_org" }, 403);
    }
    let body: { co_publisher_email?: string } = {};
    try {
      body = (await c.req.json()) as { co_publisher_email?: string };
    } catch {
      /* empty */
    }
    const coEmail = body.co_publisher_email?.trim().toLowerCase() ?? "";

    const active = await pool.query<{
      policy_id: string;
      name: string;
      version: number;
      content_hash: string | null;
    }>(
      `SELECT policy_id, name, version, content_hash
         FROM policy
        WHERE organization_id = $1 AND status = 'active'
        ORDER BY activated_at DESC NULLS LAST
        LIMIT 1`,
      [session.organizationId],
    );
    const v3 = active.rows[0];
    if (!v3) return c.json({ error: "no_active_policy" }, 409);

    const rules = await pool.query<{
      tool_pattern: string;
      decision: string;
      priority: number;
      conditions: unknown;
    }>(
      `SELECT tool_pattern, decision, priority, conditions
         FROM policy_rule WHERE policy_id = $1 ORDER BY priority DESC`,
      [v3.policy_id],
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const nextVer = v3.version + 1;
      const draftId = `pol_${cryptoRandom(16)}`;
      await client.query(
        `INSERT INTO policy (
           policy_id, organization_id, name, version, status, created_by,
           environment, dual_publish_required
         ) VALUES ($1, $2, $3, $4, 'draft', $5, 'production', true)`,
        [draftId, session.organizationId, v3.name, nextVer, session.userId],
      );
      for (const r of rules.rows) {
        await client.query(
          `INSERT INTO policy_rule (rule_id, policy_id, tool_pattern, decision, priority, conditions)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
          [
            `r_${cryptoRandom(12)}`,
            draftId,
            r.tool_pattern,
            r.decision,
            r.priority,
            r.conditions ? JSON.stringify(r.conditions) : null,
          ],
        );
      }
      // Visible live change for the room: an unreachable amount band (valid keys only).
      // Diff UI shows it as added; normal Demo Bank amounts never hit it.
      await client.query(
        `INSERT INTO policy_rule (rule_id, policy_id, tool_pattern, decision, priority, conditions)
         VALUES ($1, $2, 'governed.action', 'allow', 1, $3::jsonb)`,
        [
          `r_v4_${cryptoRandom(10)}`,
          draftId,
          JSON.stringify({ amount_gte: 999_999_999_999 }),
        ],
      );

      let coPublisherElevated = false;
      if (coEmail) {
        const elev = await client.query(
          `UPDATE membership m SET role = 'admin'
              FROM account a
             WHERE a.account_id = m.account_id
               AND m.organization_id = $1
               AND lower(a.email) = $2
               AND m.status = 'active'`,
          [session.organizationId, coEmail],
        );
        coPublisherElevated = (elev.rowCount ?? 0) > 0;
      }
      await client.query("COMMIT");
      await auditFromConsoleSession(pool, session, {
        action: "demo_tenant.v4_draft_prepared",
        resourceType: "policy",
        resourceId: draftId,
        metadata: {
          against_policy_id: v3.policy_id,
          against_version: v3.version,
          draft_version: nextVer,
          dual_publish_required: true,
          co_publisher_elevated: coPublisherElevated,
        },
      });
      return c.json(
        {
          ok: true,
          draft: {
            policy_id: draftId,
            version: nextVer,
            dual_publish_required: true,
          },
          against: {
            policy_id: v3.policy_id,
            version: v3.version,
            content_hash: v3.content_hash,
          },
          co_publisher_elevated: coPublisherElevated,
        },
        201,
      );
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      console.error(
        "[console] prepare-v4-dual-publish",
        err instanceof Error ? err.message : err,
      );
      return c.json({ error: "Failed to prepare v4 draft" }, 500);
    } finally {
      client.release();
    }
  },
);

function cryptoRandom(n: number): string {
  return randomBytes(Math.ceil(n / 2))
    .toString("hex")
    .slice(0, n);
}
