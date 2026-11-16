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

    await client.query("BEGIN");
    try {
      // A bank system replaying events it decided under its own fallback while Aegis was
      // unreachable says so (attributes.decided_without_aegis). That only ever makes the
      // receipt more conservative ("decided without Aegis"); it can never relax a rule.
      const decision = await handleBankEvent(client, auth.organizationId, event, {
        decidedWithoutAegis: event.attributes.decided_without_aegis === true,
      });
      await client.query("COMMIT");
      return c.json(decision, 200);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  } finally {
    client.release();
  }
}
