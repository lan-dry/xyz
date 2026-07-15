import {
  verifyEventSignature,
  type ApsEvent,
} from "@salanor/aegis";
import type { Context } from "hono";
import {
  assertIngestWithinLimits,
  checkRateLimit,
  getClientIp,
  ingestRateLimitKey,
  PlanLimitError,
  rateLimitResponse,
  readRateLimitEnv,
} from "@salanor/platform-auth";
import { resolveIngestKey } from "../auth/ingest-key.js";
import { getPool } from "../db/pool.js";
import { persistSignedEvent } from "../ingest/persist.js";
import { evaluateToolPolicy } from "../policy/evaluate.js";
import { exportEventToSiemDestinations } from "../siem/export.js";
import { enrichProvenancePayload } from "../ingest/enrich-payload.js";
import {
  assertOrganizationMatch,
  IngestValidationError,
  parseApsEvent,
} from "../ingest/validate.js";

function bearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }
  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export async function postEvent(c: Context): Promise<Response> {
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

  const idempotencyKey = c.req.header("Idempotency-Key")?.trim() || undefined;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 422);
  }

  let event: ApsEvent;
  try {
    event = parseApsEvent(body);
  } catch (error) {
    const message =
      error instanceof IngestValidationError
        ? error.message
        : "Invalid event";
    return c.json({ error: message }, 422);
  }

  const client = await getPool().connect();
  try {
    const auth = await resolveIngestKey(client, token);
    if (!auth) {
      return c.json({ error: "Invalid API key" }, 401);
    }

    try {
      assertOrganizationMatch(event, auth.organizationId);
    } catch (error) {
      const message =
        error instanceof IngestValidationError
          ? error.message
          : "Forbidden";
      return c.json({ error: message }, 403);
    }

    const keyRow = await client.query<{ public_key_b64: string }>(
      `SELECT public_key_b64 FROM signing_key
       WHERE key_id = $1 AND organization_id = $2 AND agent_id = $3
         AND revoked = false`,
      [event.key_id, event.organization_id, event.agent_id],
    );
    const publicKey = keyRow.rows[0]?.public_key_b64;
    if (!publicKey) {
      return c.json({ error: "Unknown signing key" }, 422);
    }

    let valid = false;
    try {
      valid = await verifyEventSignature(event, publicKey);
    } catch {
      valid = false;
    }
    if (!valid) {
      return c.json({ error: "Invalid signature" }, 422);
    }

    const toolName = event.tool_name?.trim() ?? "";
    if (toolName) {
      const policyPayload = enrichProvenancePayload({
        payload: event.payload as Record<string, unknown>,
        toolName,
        actionKind: event.action_kind,
        policyId: event.policy_id,
      });
      const policy = await evaluateToolPolicy(client, {
        organizationId: event.organization_id,
        agentId: event.agent_id,
        toolName,
        payload: policyPayload,
      });
      if (policy.decision === "deny") {
        event.policy_decision = "deny";
        if (policy.policy_id !== "none") {
          event.policy_id = policy.policy_id;
        }
      } else if (policy.decision === "allow_with_obligation") {
        event.policy_decision = "allow_with_obligation";
        if (policy.policy_id !== "none") {
          event.policy_id = policy.policy_id;
        }
      }
    }

    try {
      await assertIngestWithinLimits(client, auth.organizationId);
    } catch (error) {
      if (error instanceof PlanLimitError) {
        return c.json(
          { error: error.message, code: error.code },
          error.httpStatus as 402 | 403 | 404 | 429,
        );
      }
      throw error;
    }

    await client.query("BEGIN");

    const result = await persistSignedEvent(client, event, idempotencyKey);

    if (!result.replayed) {
      const { recordNewIngestedEvent } = await import("@salanor/platform-auth");
      await recordNewIngestedEvent(client, auth.organizationId);
    }

    await client.query("COMMIT");

    if (result.replayed) {
      return c.json({ event_id: result.eventId, status: "replayed" }, 200);
    }

    const pool = getPool();
    void exportEventToSiemDestinations(pool, event).catch((err) => {
      console.error("siem export error", err);
    });

    return c.json(
      {
        event_id: result.eventId,
        sequence_num: result.sequenceNum,
        event_hash: result.eventHash,
        chain_valid: result.chainValid,
        status: "created",
      },
      201,
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("ingest error", error);
    const message = error instanceof Error ? error.message : "Ingest failed";
    return c.json({ error: message }, 422);
  } finally {
    client.release();
  }
}
