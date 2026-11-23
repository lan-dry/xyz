/**
 * Gate 1 console: onboarding checklist, reset sandbox, send test events (sandbox only).
 */
import { Hono } from "hono";
import { canWriteOrgConsole } from "@salanor/platform-auth";
import { getPool } from "../../db/pool.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";
import { rejectNonSyntheticPayload } from "../../tenants/synthetic-guard.js";

export const sandboxConsoleRoutes = new Hono<{ Variables: ConsoleVariables }>();

async function loadOrg(organizationId: string) {
  const r = await getPool().query<{
    tenant_kind: string;
    sandbox_expires_at: Date | null;
    onboarding_checklist: Record<string, unknown>;
    is_demo: boolean;
  }>(
    `SELECT COALESCE(tenant_kind, 'real') AS tenant_kind,
            sandbox_expires_at,
            COALESCE(onboarding_checklist, '{}'::jsonb) AS onboarding_checklist,
            is_demo
       FROM organization WHERE organization_id = $1`,
    [organizationId],
  );
  return r.rows[0] ?? null;
}

sandboxConsoleRoutes.get("/sandbox/status", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  const org = await loadOrg(session.organizationId);
  if (!org) return c.json({ error: "Not found" }, 404);
  const checklist = org.onboarding_checklist ?? {};
  return c.json({
    tenant_kind: org.tenant_kind,
    is_sandbox: org.tenant_kind === "sandbox",
    sandbox_expires_at: org.sandbox_expires_at?.toISOString() ?? null,
    banner:
      org.tenant_kind === "sandbox"
        ? "Sandbox, synthetic data only"
        : org.is_demo
          ? "Demo environment, synthetic data"
          : null,
    checklist: {
      create_api_key: Boolean(checklist.create_api_key),
      send_first_event: Boolean(checklist.send_first_event),
      see_sealed: Boolean(checklist.see_sealed),
      approve_held: Boolean(checklist.approve_held),
      verify_bundle: Boolean(checklist.verify_bundle),
      invite_colleague: Boolean(checklist.invite_colleague),
    },
  });
});

sandboxConsoleRoutes.post("/sandbox/reset", requireConsoleSession, async (c) => {
  const session = c.get("consoleSession");
  if (!canWriteOrgConsole(session, session.organizationId)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const org = await loadOrg(session.organizationId);
  if (!org || org.tenant_kind !== "sandbox") {
    return c.json(
      {
        error: "not_sandbox",
        message: "Only a sandbox organisation can use Reset my sandbox.",
      },
      403,
    );
  }
  // Soft reset: clear cases/events for this org via wipe function when available.
  try {
    await getPool().query(`SELECT platform_wipe_tenant($1, true, $2)`, [
      (
        await getPool().query<{ slug: string }>(
          `SELECT slug FROM organization WHERE organization_id = $1`,
          [session.organizationId],
        )
      ).rows[0]?.slug,
      `console:${session.email}:reset-sandbox`,
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg, code: "reset_failed" }, 500);
  }
  await getPool().query(
    `UPDATE organization
        SET onboarding_checklist = '{}'::jsonb,
            sandbox_expires_at = now() + interval '30 days'
      WHERE organization_id = $1`,
    [session.organizationId],
  );
  return c.json({ ok: true, message: "Sandbox reset. Synthetic data only." });
});

/** Sandbox-only test sender: signs nothing in the browser; uses platform-held key path. */
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
  const body = (await c.req.json().catch(() => ({}))) as {
    scenario?: string;
  };
  const scenario = body.scenario?.trim() || "routine";
  const event = {
    schema_version: 1,
    case_id: `SBX-${Date.now().toString(36).toUpperCase()}`,
    idempotency_key: crypto.randomUUID(),
    event_type: "loan_decision",
    product: "retail_loan",
    emitted_at: new Date().toISOString(),
    actor: { type: "system", id: "sandbox-test-sender" },
    attributes: {
      amount: scenario === "held" ? 18_000_000 : 1_200_000,
      currency: "RWF",
      beneficiary_account: "ACCT-DEMO-001",
      applicant_name: "Sandbox Test Applicant",
      product: "retail_loan",
      requester_email: "officer@demo.test",
      requester_role: "credit_officer",
    },
    trace_id: `tr_sbx_${Date.now().toString(36)}`,
  };
  const syn = rejectNonSyntheticPayload(event);
  if (syn) {
    return c.json({ error: syn.code, message: syn.message }, 422);
  }
  // Mark checklist progress; full signed ingest needs sandbox source key (provisioned separately).
  await getPool().query(
    `UPDATE organization
        SET onboarding_checklist =
              COALESCE(onboarding_checklist, '{}'::jsonb) || '{"send_first_event": true}'::jsonb
      WHERE organization_id = $1`,
    [session.organizationId],
  );
  return c.json({
    ok: true,
    scenario,
    message:
      "Test event template ready. Use your sandbox ingest key and Connector (or the platform sandbox source key) to POST this payload to /v1/aegis/source-events.",
    request: {
      method: "POST",
      endpoint: "/v1/aegis/source-events",
      payload: event,
    },
    response: {
      status: "template",
      note: "Not delivered until signed with the sandbox source key (never sent to the browser).",
    },
  });
});
