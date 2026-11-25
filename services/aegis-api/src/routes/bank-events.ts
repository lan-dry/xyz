import type { Context } from "hono";
import {
  checkRateLimit,
  getClientIp,
  ingestRateLimitKey,
  rateLimitResponse,
  readRateLimitEnv,
} from "@salanor/platform-auth";
import { resolveIngestKey } from "../auth/ingest-key.js";
import { handleBankEvent } from "../bank/handle-event.js";
import { BankValidationError, parseBankEvent } from "../bank/validate.js";
import { getPool } from "../db/pool.js";
import { enforceOrgIngestControls } from "../limits/tenant-limits.js";
import { organizationRequiresSignedEvents } from "../sources/registry.js";
import { markOnboardingStep } from "../tenants/onboarding-checklist.js";
import { ensureSandboxSigningAgent } from "../tenants/sandbox-signing.js";
import { blockSandboxIngest } from "../tenants/synthetic-guard.js";
import { ingestSignedEnvelope, isEnvelopeBody } from "./source-events.js";

/** 400 body for unsigned events sent to an organisation that requires signed events. */
export function signedEventsRequiredBody() {
  return {
    error: "signed_events_required",
    code: "signed_events_required",
    message:
      "This organisation only accepts signed events. Send them through the Aegis Connector " +
      "or the @salanor/aegis-sdk (sendEvent), which wrap each event in a signed envelope " +
      "from a registered source key, or post a signed envelope to /v1/aegis/source-events.",
  } as const;
}

function bearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export async function postBankEvent(c: Context): Promise<Response> {
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

  let body: unknown;
  try {
    body = await c.req.json();
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

  // Signed AEGIS-SRC1 envelope: same handler as POST /v1/aegis/source-events.
  if (isEnvelopeBody(body)) {
    return ingestSignedEnvelope(c, token, body);
  }

  let event;
  try {
    event = parseBankEvent(body);
  } catch (error) {
    if (error instanceof BankValidationError) {
      return c.json(error.body, 400);
    }
    return c.json(
      {
        error: "validation_error",
        code: "malformed_bank_event",
        message: "Malformed bank event",
      },
      400,
    );
  }

  const headerIdem = c.req.header("Idempotency-Key")?.trim();
  if (headerIdem && headerIdem !== event.idempotency_key) {
    return c.json(
      {
        error: "validation_error",
        code: "idempotency_mismatch",
        message: "Idempotency-Key header must match body.idempotency_key",
      },
      400,
    );
  }

  const client = await getPool().connect();
  try {
    const auth = await resolveIngestKey(client, token);
    if (!auth) {
      return c.json({ error: "Invalid API key" }, 401);
    }

    const blocked = await enforceOrgIngestControls(client, auth.organizationId);
    if (blocked) return blocked;

    if (await organizationRequiresSignedEvents(client, auth.organizationId)) {
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
    const synthetic = blockSandboxIngest(orgGate.rows[0], body);
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

    await client.query("BEGIN");
    try {
      if (orgGate.rows[0]?.tenant_kind === "sandbox") {
        await ensureSandboxSigningAgent(client, auth.organizationId);
      }
      // A bank system replaying events it decided under its own fallback while Aegis was
      // unreachable says so (attributes.decided_without_aegis). That only ever makes the
      // receipt more conservative ("decided without Aegis"); it can never relax a rule.
      const decision = await handleBankEvent(client, auth.organizationId, event, {
        decidedWithoutAegis: event.attributes.decided_without_aegis === true,
        ingestKeyId: auth.keyId,
      });
      await client.query("COMMIT");
      await markOnboardingStep(client, auth.organizationId, "send_first_event");
      return c.json(decision, 200);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  } finally {
    client.release();
  }
}
