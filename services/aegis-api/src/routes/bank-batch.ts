import type { Context } from "hono";
import {
  checkRateLimit,
  getClientIp,
  ingestRateLimitKey,
  rateLimitResponse,
  readRateLimitEnv,
} from "@salanor/platform-auth";
import { resolveIngestKey } from "../auth/ingest-key.js";
import {
  runBatchImport,
  type ColumnMapping,
} from "../bank/batch-import.js";
import { handleBankEvent } from "../bank/handle-event.js";
import type { BankEvent } from "../bank/types.js";
import { getPool } from "../db/pool.js";
import { enforceOrgIngestControls } from "../limits/tenant-limits.js";
import { organizationRequiresSignedEvents } from "../sources/registry.js";
import { markOnboardingStep } from "../tenants/onboarding-checklist.js";
import { blockSandboxIngest } from "../tenants/synthetic-guard.js";
import { signedEventsRequiredBody } from "./bank-events.js";

function bearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

type BatchBody = {
  format?: "csv" | "jsonl";
  text?: string;
  mapping?: ColumnMapping;
  dry_run?: boolean;
  defaults?: Partial<BankEvent>;
};

function identityMapping(): ColumnMapping {
  return {
    case_id: "case_id",
    idempotency_key: "idempotency_key",
    event_type: "event_type",
    product: "product",
    workflow_id: "workflow_id",
    emitted_at: "emitted_at",
    trace_id: "trace_id",
    amount: "attributes.amount",
    currency: "attributes.currency",
  };
}

/**
 * POST /v1/aegis/governed/events/batch (and /bank/events/batch).
 * Always record-only. dry_run defaults to true.
 */
export async function postBankEventBatch(c: Context): Promise<Response> {
  const ip = getClientIp(c.req.raw.headers);
  const ingestLimit = readRateLimitEnv("INGEST_RATE_LIMIT_PER_MIN", 300);
  const rl = checkRateLimit(ingestRateLimitKey(ip), {
    limit: ingestLimit,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec);
  }

  const token = bearerToken(c.req.header("Authorization"));
  if (!token) {
    return c.json({ error: "Missing or invalid Authorization" }, 401);
  }

  let body: BatchBody;
  try {
    body = (await c.req.json()) as BatchBody;
  } catch {
    return c.json(
      {
        error: "validation_error",
        code: "invalid_json",
        message: "Invalid JSON body",
      },
      400,
    );
  }

  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) {
    return c.json(
      {
        error: "validation_error",
        code: "missing_text",
        message: "Body must include non-empty text (CSV or JSONL)",
      },
      400,
    );
  }

  const format = body.format === "jsonl" ? "jsonl" : "csv";
  const mapping =
    body.mapping && typeof body.mapping === "object" && !Array.isArray(body.mapping)
      ? body.mapping
      : identityMapping();
  const dryRun = body.dry_run !== false;

  const client = await getPool().connect();
  try {
    const auth = await resolveIngestKey(client, token);
    if (!auth) {
      return c.json({ error: "Invalid API key" }, 401);
    }

    // Dry run does not store events, so the sandbox quota does not apply.
    const blocked = await enforceOrgIngestControls(client, auth.organizationId, {
      enforceQuota: !dryRun,
    });
    if (blocked) return blocked;

    // Batch imports are unsigned; a dry run only reports, so only committing is refused.
    if (!dryRun && (await organizationRequiresSignedEvents(client, auth.organizationId))) {
      return c.json(signedEventsRequiredBody(), 400);
    }

    const orgGate = await client.query<{
      tenant_kind: string;
      sandbox_archived_at: Date | null;
      sandbox_read_only_until: Date | null;
    }>(
      `SELECT COALESCE(tenant_kind, 'real') AS tenant_kind,
              sandbox_archived_at, sandbox_read_only_until
         FROM organization WHERE organization_id = $1`,
      [auth.organizationId],
    );
    const synthetic = blockSandboxIngest(orgGate.rows[0], { text, defaults: body.defaults });
    if (synthetic) {
      return c.json(
        {
          error: synthetic.error,
          code: synthetic.code,
          message: synthetic.message,
          field: synthetic.field,
        },
        synthetic.status,
      );
    }

    const report = await runBatchImport(text, format, mapping, {
      dry_run: dryRun,
      defaults: body.defaults,
      commit: dryRun
        ? undefined
        : async (event) =>
            handleBankEvent(client, auth.organizationId, event, {
              forceRecordOnly: true,
              ingestKeyId: auth.keyId,
            }),
    });

    if (!dryRun && report.committed_rows > 0) {
      await markOnboardingStep(client, auth.organizationId, "send_first_event");
    }
    return c.json(report, 200);
  } finally {
    client.release();
  }
}
