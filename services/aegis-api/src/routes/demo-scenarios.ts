/**
 * Demo-only HTTP entry for scenarios 1–12.
 * Unavailable unless AEGIS_DEMO_MODE=true and process is not production.
 * Auth: ingest Bearer key.
 *
 * Body:
 *   { ids?: number[], approvals?: "fixture" | "http" }
 * - fixture (default): approval scenarios use in-process checkApprovalAttempt
 * - http: scenarios 2,3,4,6,7 drive real /approvals/request + console decide/release
 */
import type { Context } from "hono";
import { randomUUID } from "node:crypto";
import { resolveIngestKey } from "../auth/ingest-key.js";
import { isDemoModeAllowed } from "../bank/demo-clock.js";
import { handleBankEvent } from "../bank/handle-event.js";
import { getPool } from "../db/pool.js";
import { runHttpApprovalScenario } from "../demo/live-approvals-http.js";
import { runScenarios, scenarioRunners } from "../demo/scenario-runners.js";
import { loadDemoPack } from "../packs/load.js";
import { parseBankEvent } from "../bank/validate.js";

const HTTP_APPROVAL_SCENARIOS = new Set([2, 3, 4, 5, 6, 7, 9, 10, 11, 12]);

function receiptKindFromIntake(
  intake: { sealed: boolean; event_id?: string } | null,
): "sealed" | "provisional" | "none" {
  if (!intake) return "none";
  if (intake.sealed) return "sealed";
  if (intake.event_id?.startsWith("evt_gov_")) return "provisional";
  return intake.event_id ? "provisional" : "none";
}

function bearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function isSealed(body: {
  event_id?: string | null;
  event_hash?: string | null;
  sequence_num?: number | null;
}): boolean {
  const id = body.event_id ?? "";
  if (!id || id.startsWith("evt_gov_")) return false;
  if (!body.event_hash) return false;
  if (body.sequence_num == null || !Number.isFinite(Number(body.sequence_num))) {
    return false;
  }
  return true;
}

async function sealIntakeForScenario(
  organizationId: string,
  scenarioId: number,
): Promise<{ sealed: boolean; event_id?: string; outcome?: string } | null> {
  const currency = loadDemoPack("banking").currencies[0]!;
  const specs: Record<number, Record<string, unknown>> = {
    1: { amount: 3_000_000, currency },
    2: { amount: 18_000_000, currency },
    3: {
      amount: 12_000_000,
      currency,
      model: {
        id: "risk-v2",
        version: "2.1",
        score: 0.82,
        recommendation: "decline",
      },
    },
    8: {
      amount: 1_000_000,
      currency,
      national_id: "1199780012345678",
      purpose: "kyc",
    },
  };
  const attrs = specs[scenarioId];
  if (!attrs) return null;

  const caseId = `demo_s${scenarioId}_${randomUUID().slice(0, 8)}`;
  const idem = `idem_demo_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const event = parseBankEvent({
    schema_version: 1,
    case_id: caseId,
    idempotency_key: idem,
    event_type: scenarioId === 8 ? "data_access" : "loan_decision",
    product: "retail_loan",
    emitted_at: new Date().toISOString(),
    attributes: attrs,
  });

  const client = await getPool().connect();
  try {
    const decision = await handleBankEvent(client, organizationId, event);
    return {
      sealed: isSealed(decision),
      event_id: decision.event_id ?? undefined,
      outcome: decision.outcome,
    };
  } finally {
    client.release();
  }
}

export async function postDemoScenariosRun(c: Context): Promise<Response> {
  if (!isDemoModeAllowed()) {
    return c.json(
      {
        error: "demo_mode_required",
        message:
          "Demo scenarios endpoint requires AEGIS_DEMO_MODE=true and is unavailable when NODE_ENV/AEGIS_ENV is production",
      },
      403,
    );
  }

  const token = bearerToken(c.req.header("Authorization"));
  if (!token) {
    return c.json({ error: "Missing or invalid Authorization" }, 401);
  }

  let ids: number[] = Object.keys(scenarioRunners)
    .map(Number)
    .sort((a, b) => a - b);
  let approvalsMode: "fixture" | "http" = "fixture";
  try {
    const body = (await c.req.json().catch(() => ({}))) as {
      ids?: number[];
      approvals?: string;
    };
    if (Array.isArray(body.ids) && body.ids.length > 0) {
      ids = body.ids.map(Number);
    }
    if (body.approvals === "http") approvalsMode = "http";
  } catch {
    // empty body OK
  }

  const client = await getPool().connect();
  let organizationId: string;
  try {
    const auth = await resolveIngestKey(client, token);
    if (!auth) {
      return c.json({ error: "Invalid API key" }, 401);
    }
    organizationId = auth.organizationId;
  } finally {
    client.release();
  }

  const logic = await runScenarios(ids);
  const results = [];
  for (const row of logic) {
    const intake = await sealIntakeForScenario(organizationId, row.id);
    let ok = row.ok && (intake == null || intake.sealed);
    let detail = intake
      ? `${row.detail}; sealed_http=${intake.sealed} event_id=${intake.event_id ?? ""} outcome=${intake.outcome ?? ""}`
      : row.detail;
    let approvals: "fixture" | "http" | undefined =
      row.id === 2 ||
      row.id === 3 ||
      row.id === 4 ||
      row.id === 5 ||
      row.id === 6 ||
      row.id === 7 ||
      row.id === 9 ||
      row.id === 10 ||
      row.id === 11 ||
      row.id === 12
        ? "fixture"
        : undefined;
    let receipt_kind: "sealed" | "provisional" | "none" =
      receiptKindFromIntake(intake);

    if (approvalsMode === "http" && HTTP_APPROVAL_SCENARIOS.has(row.id)) {
      try {
        const http = await runHttpApprovalScenario(organizationId, row.id);
        if (!http) {
          throw new Error(`no HTTP approval runner for scenario ${row.id}`);
        }
        // HTTP runners seal inside their own path; outer intake may be null.
        ok = http.ok;
        detail = `${http.detail}; fixture_guards=${row.ok}`;
        approvals = "http";
        if (http.detail.includes("sealed=true")) receipt_kind = "sealed";
        else if (http.detail.includes("provisional=true")) {
          receipt_kind = "provisional";
        } else if (http.detail.includes("receipt=") && !http.detail.includes("receipt=none")) {
          receipt_kind = "sealed";
        }
      } catch (err) {
        ok = false;
        detail = `http_approvals_error: ${err instanceof Error ? err.message : String(err)}`;
        approvals = "http";
      }
    }

    results.push({
      id: row.id,
      name: row.name,
      ok,
      detail,
      sealed_intake: intake,
      receipt_kind,
      approvals,
    });
  }

  const failed = results.filter((r) => !r.ok).length;
  return c.json({
    target: "live_http_demo_scenarios",
    organization_id: organizationId,
    approvals_mode: approvalsMode,
    failed,
    results,
  });
}
