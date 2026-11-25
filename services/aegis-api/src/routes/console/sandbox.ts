/**
 * Gate 1 console: onboarding checklist, reset sandbox, signed test events (sandbox only).
 */
import { Hono } from "hono";
import { canWriteOrgConsole } from "@salanor/platform-auth";
import { getPool } from "../../db/pool.js";
import { loadEvidenceBundle } from "../../forensic/evidence-bundle.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";
import { markOnboardingStep } from "../../tenants/onboarding-checklist.js";
import { SandboxTestSenderError, deliverSandboxTestEvent } from "../../tenants/sandbox-test-sender.js";
import { ensureSandboxStarterPack } from "../../tenants/sandbox-starter-pack.js";
import {
  mergeTenantCopy,
  sandboxDaysRemaining,
} from "../../tenants/tenant-copy.js";
import {
  assertCanSetTenantKind,
  normalizeTenantKind,
  type TenantKind,
} from "../../tenants/tenant-kind.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const sandboxConsoleRoutes = new Hono<{ Variables: ConsoleVariables }>();

const SAMPLE_FEED_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../docs/quickstart/samples/sample-feed.jsonl",
);

async function loadOrg(organizationId: string) {
  const r = await getPool().query<{
    tenant_kind: string;
    sandbox_expires_at: Date | null;
    onboarding_checklist: Record<string, unknown>;
    is_demo: boolean;
    governance_settings: Record<string, unknown> | null;
  }>(
    `SELECT COALESCE(tenant_kind, 'real') AS tenant_kind,
            sandbox_expires_at,
            COALESCE(onboarding_checklist, '{}'::jsonb) AS onboarding_checklist,
            is_demo,
            COALESCE(governance_settings, '{}'::jsonb) AS governance_settings
       FROM organization WHERE organization_id = $1`,
    [organizationId],
  );
  return r.rows[0] ?? null;
}

function notSandbox() {
  return {
    error: "not_sandbox",
    message: "This action is only available for a sandbox organisation.",
  };
}

sandboxConsoleRoutes.get("/sandbox/status", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  const org = await loadOrg(session.organizationId);
  if (!org) return c.json({ error: "Not found" }, 404);
  let starter: Awaited<ReturnType<typeof ensureSandboxStarterPack>> | null = null;
  let applied = org.governance_settings?.applied_pack as
    | { id?: string; version?: number }
    | undefined;
  if (org.tenant_kind === "sandbox") {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      starter = await ensureSandboxStarterPack(client, session.organizationId);
      await client.query("COMMIT");
      const refreshed = await loadOrg(session.organizationId);
      applied = refreshed?.governance_settings?.applied_pack as
        | { id?: string; version?: number }
        | undefined;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      console.error("[sandbox] starter pack ensure failed", err);
    } finally {
      client.release();
    }
  }
  const checklist = org.onboarding_checklist ?? {};
  const isSandbox = org.tenant_kind === "sandbox";
  const days = isSandbox ? sandboxDaysRemaining(org.sandbox_expires_at) : null;
  const copyOverride = org.governance_settings?.console_copy;
  return c.json({
    tenant_kind: org.tenant_kind,
    is_sandbox: isSandbox,
    sandbox_expires_at: org.sandbox_expires_at?.toISOString() ?? null,
    days_remaining: days,
    banner: isSandbox
      ? "Sandbox · synthetic data only"
      : org.is_demo
        ? "Demo environment, synthetic data"
        : null,
    decision_mode: {
      record_only_default:
        "New workflows you create start in record-only: Aegis evaluates and seals what it would have done, but does not block.",
      enforce_from_pack:
        "The sandbox starter pack installs retail_loan and payment_transfer in enforce (decision) mode so held, override, and split scenarios pause for a person.",
      applied_pack: starter?.packId
        ? { id: starter.packId, version: starter.packVersion, just_seeded: starter.applied }
        : applied?.id
          ? { id: applied.id, version: applied.version ?? null, just_seeded: false }
          : null,
    },
    checklist: {
      create_api_key: Boolean(checklist.create_api_key),
      send_first_event: Boolean(checklist.send_first_event),
      see_sealed: Boolean(checklist.see_sealed),
      approve_held: Boolean(checklist.approve_held),
      verify_bundle: Boolean(checklist.verify_bundle),
      invite_colleague: Boolean(checklist.invite_colleague),
    },
    copy: mergeTenantCopy(isSandbox, copyOverride),
  });
});

/**
 * Convert the current organisation to a sandbox (admin/owner).
 * Sets tenant_kind=sandbox, 30-day expiry, and default quotas.
 * Demo orgs and existing sandboxes are refused; sandbox→real is refused.
 */
sandboxConsoleRoutes.post("/sandbox/enable", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (session.role !== "admin" && session.role !== "owner") {
    return c.json({ error: "Forbidden" }, 403);
  }
  const pool = getPool();
  const row = await pool.query<{
    tenant_kind: string;
    is_demo: boolean;
    slug: string;
  }>(
    `SELECT COALESCE(tenant_kind, 'real') AS tenant_kind,
            COALESCE(is_demo, false) AS is_demo,
            slug
       FROM organization WHERE organization_id = $1`,
    [session.organizationId],
  );
  const org = row.rows[0];
  if (!org) return c.json({ error: "Not found" }, 404);
  if (org.is_demo) {
    return c.json(
      {
        error: "demo_immutable",
        message:
          "Demo organisations stay as demo. Create a separate sandbox organisation instead.",
      },
      403,
    );
  }
  const from = normalizeTenantKind(org.tenant_kind);
  const gate = assertCanSetTenantKind(from, "sandbox");
  if (!gate.ok) {
    return c.json({ error: gate.code, message: gate.message }, 403);
  }
  if (from === "sandbox") {
    const days = sandboxDaysRemaining(
      (
        await pool.query<{ sandbox_expires_at: Date | null }>(
          `SELECT sandbox_expires_at FROM organization WHERE organization_id = $1`,
          [session.organizationId],
        )
      ).rows[0]?.sandbox_expires_at ?? null,
    );
    return c.json({
      ok: true,
      unchanged: true,
      tenant_kind: "sandbox" as TenantKind,
      days_remaining: days,
      banner: "Sandbox · synthetic data only",
    });
  }

  await pool.query(
    `UPDATE organization
        SET tenant_kind = 'sandbox',
            is_test = true,
            sandbox_expires_at = COALESCE(sandbox_expires_at, now() + interval '30 days'),
            event_quota_daily = COALESCE(event_quota_daily, 5000),
            storage_quota_mb = COALESCE(storage_quota_mb, 512),
            sandbox_archived_at = NULL,
            sandbox_read_only_until = NULL,
            updated_at = now()
      WHERE organization_id = $1`,
    [session.organizationId],
  );

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureSandboxStarterPack(client, session.organizationId);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("[sandbox] enable starter pack failed", err);
  } finally {
    client.release();
  }

  await pool.query(
    `INSERT INTO platform_sandbox_audit (organization_id, action, actor, detail)
     VALUES ($1, 'enable', $2, $3::jsonb)`,
    [
      session.organizationId,
      `console:${session.email}`,
      JSON.stringify({ from, slug: org.slug }),
    ],
  ).catch(() => undefined);

  return c.json({
    ok: true,
    tenant_kind: "sandbox" as TenantKind,
    days_remaining: 30,
    banner: "Sandbox · synthetic data only",
    event_quota_daily: 5000,
    storage_quota_mb: 512,
  });
});

sandboxConsoleRoutes.post("/sandbox/reset", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (!canWriteOrgConsole(session, session.organizationId)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const orgMeta = await getPool().query<{
    name: string;
    slug: string;
    tenant_kind: string;
  }>(
    `SELECT name, slug, COALESCE(tenant_kind, 'real') AS tenant_kind
       FROM organization WHERE organization_id = $1`,
    [session.organizationId],
  );
  const org = orgMeta.rows[0];
  if (!org || org.tenant_kind !== "sandbox") {
    return c.json(
      {
        error: "not_sandbox",
        message: "Only a sandbox organisation can use Reset sandbox.",
      },
      403,
    );
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    confirm_name?: string;
  };
  const confirm = (body.confirm_name ?? "").trim();
  const expectedName = org.name.trim();
  const expectedPhrase = "RESET SANDBOX";
  if (
    confirm.localeCompare(expectedName, undefined, { sensitivity: "accent" }) !== 0 &&
    confirm.toUpperCase() !== expectedPhrase
  ) {
    return c.json(
      {
        error: "confirm_mismatch",
        message: `Type the organisation name (${expectedName}) or RESET SANDBOX to confirm.`,
      },
      422,
    );
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT platform_reset_sandbox($1, $2)`, [
      session.organizationId,
      `console:${session.email}:reset-sandbox`,
    ]);
    await ensureSandboxStarterPack(client, session.organizationId, { force: true });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = err instanceof Error ? err.message : String(err);
    if (/sandbox_reset_refused/i.test(msg)) {
      return c.json(
        {
          error: "not_sandbox",
          message: "Only a sandbox organisation can use Reset sandbox.",
        },
        403,
      );
    }
    return c.json({ error: msg, code: "reset_failed" }, 500);
  } finally {
    client.release();
  }
  return c.json({
    ok: true,
    message: "Sandbox reset. Cases cleared. Checklist starts over. Synthetic data only.",
  });
});

/** Sandbox-only test sender. Signs on the server and ingests the event. */
sandboxConsoleRoutes.post("/sandbox/test-events", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (!canWriteOrgConsole(session, session.organizationId)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const org = await loadOrg(session.organizationId);
  if (!org || org.tenant_kind !== "sandbox") {
    return c.json(
      {
        error: "not_sandbox",
        message: "Send test events is only available in a sandbox.",
      },
      403,
    );
  }
  const body = (await c.req.json().catch(() => ({}))) as { scenario?: string };
  const scenario = body.scenario?.trim() || "routine";
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    try {
      await ensureSandboxStarterPack(client, session.organizationId);
      await client.query("COMMIT");
    } catch (packErr) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw packErr;
    }
    const delivered = await deliverSandboxTestEvent(
      client,
      session.organizationId,
      scenario,
    );
    return c.json({
      ok: true,
      delivered: true,
      scenario: delivered.scenario,
      source_signed: true,
      message: "Signed test event delivered. The signing key stayed on the server.",
      case_id: delivered.decision.case_id,
      trace_id: delivered.trace_id,
      outcome: delivered.decision.outcome,
      event: delivered.event,
      response: delivered.decision,
    });
  } catch (err) {
    if (err instanceof SandboxTestSenderError) {
      const status = err.status === 503 ? 503 : err.status === 500 ? 500 : 422;
      return c.json({ error: err.code, message: err.message }, status);
    }
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: "send_failed", message: msg }, 500);
  } finally {
    client.release();
  }
});

sandboxConsoleRoutes.get("/sandbox/sample-feed", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  const org = await loadOrg(session.organizationId);
  if (!org || org.tenant_kind !== "sandbox") {
    return c.json(notSandbox(), 403);
  }
  const text = readFileSync(SAMPLE_FEED_PATH, "utf8");
  return new Response(text, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": 'attachment; filename="sample-feed.jsonl"',
      "Cache-Control": "no-store",
    },
  });
});

sandboxConsoleRoutes.get("/sandbox/sample-bundle", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  const org = await loadOrg(session.organizationId);
  if (!org || org.tenant_kind !== "sandbox") {
    return c.json(notSandbox(), 403);
  }
  const latest = await getPool().query<{ trace_id: string }>(
    `SELECT trace_id
       FROM event
      WHERE organization_id = $1
        AND sig_value_b64 IS NOT NULL
      ORDER BY emitted_at DESC
      LIMIT 1`,
    [session.organizationId],
  );
  const traceId = latest.rows[0]?.trace_id;
  if (!traceId) {
    return c.json(
      {
        error: "No sealed sample yet. Send a test event, then download the bundle.",
        code: "no_sample_bundle",
      },
      404,
    );
  }
  const bundle = await loadEvidenceBundle(getPool(), session.organizationId, traceId);
  if (!bundle) {
    return c.json(
      {
        error: "No signed evidence bundle yet. Send a test event with receipt signing enabled.",
        code: "no_sample_bundle",
      },
      404,
    );
  }
  await markOnboardingStep(getPool(), session.organizationId, "verify_bundle");
  return new Response(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="sample-evidence-bundle.json"',
      "Cache-Control": "no-store",
    },
  });
});
