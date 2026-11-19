/**
 * POST /v1/aegis/source-events — AEGIS-SRC1 signed envelope ingest (ingest key auth).
 * GET  /v1/aegis/sources/:sourceId/last-seq — last accepted seq for Connector sync after conflict.
 *
 * Body is a SignedEnvelope. On success the inner event goes through the same decision
 * path as /governed/events and the full envelope (with signature) is sealed on the
 * decision. `postBankEvent` forwards here when it sees `aegis_envelope: "1"`.
 */
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
import type { BankDecisionResponse } from "../bank/types.js";
import { BankValidationError, parseBankEvent } from "../bank/validate.js";
import { getPool } from "../db/pool.js";
import { SOURCE_SIGNED_GRADE } from "../sources/grade.js";
import { getSource } from "../sources/registry.js";
import { verifyAndAcceptEnvelope } from "../sources/verify-and-accept.js";

export type SignedDecisionResponse = BankDecisionResponse & {
  source_signed: true;
  evidence_grade: typeof SOURCE_SIGNED_GRADE;
};

function bearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/** True when the body claims to be an AEGIS-SRC1 envelope. */
export function isEnvelopeBody(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    !Array.isArray(body) &&
    (body as Record<string, unknown>).aegis_envelope === "1"
  );
}

/**
 * Minimal sync endpoint for Connectors that hit seq_replay / conflict: returns the
 * last sequence Aegis has accepted for this source so the sender can advance local
 * last_seq and never reuse a number. Ingest-key auth only; not a general status API.
 */
export async function getSourceLastSeq(c: Context): Promise<Response> {
  const token = bearerToken(c.req.header("Authorization"));
  if (!token) {
    return c.json({ error: "Missing or invalid Authorization" }, 401);
  }

  const sourceId = c.req.param("sourceId")?.trim();
  if (!sourceId) {
    return c.json(
      { error: "validation_error", code: "missing_source_id", message: "sourceId is required" },
      400,
    );
  }

  const client = await getPool().connect();
  try {
    const auth = await resolveIngestKey(client, token);
    if (!auth) {
      return c.json({ error: "Invalid API key" }, 401);
    }
    const source = await getSource(client, auth.organizationId, sourceId);
    if (!source) {
      return c.json({ error: "not_found", code: "unknown_source" }, 404);
    }
    return c.json(
      {
        source_id: source.source_id,
        last_seq: source.last_seq,
        status: source.status,
      },
      200,
    );
  } finally {
    client.release();
  }
}

export async function postSourceEvent(c: Context): Promise<Response> {
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
      { error: "validation_error", code: "invalid_json", message: "Invalid JSON body" },
      400,
    );
  }

  return ingestSignedEnvelope(c, token, body);
}

/** Shared by /source-events and the envelope branch of /governed/events. */
export async function ingestSignedEnvelope(
  c: Context,
  token: string,
  body: unknown,
): Promise<Response> {
  const headerIdem = c.req.header("Idempotency-Key")?.trim();
  const bodyIdem =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>).idempotency_key
      : undefined;
  if (headerIdem && typeof bodyIdem === "string" && headerIdem !== bodyIdem) {
    return c.json(
      {
        error: "validation_error",
        code: "idempotency_mismatch",
        message: "Idempotency-Key header must match the envelope idempotency_key",
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

    const result = await verifyAndAcceptEnvelope<SignedDecisionResponse>(
      client,
      auth.organizationId,
      body,
      {
        process: async ({ envelope, key, source }) => {
          // Signature is valid; the event inside must still be a well-formed decision request.
          const event = parseBankEvent(envelope.event);
          const decision = await handleBankEvent(client, auth.organizationId, event, {
            decidedWithoutAegis: event.attributes.decided_without_aegis === true,
            sourceEnvelope: {
              envelope,
              source_id: envelope.source_id,
              source_key_id: key.key_id,
              source_name: source.name,
            },
          });
          return {
            ...decision,
            source_signed: true,
            evidence_grade: SOURCE_SIGNED_GRADE,
          };
        },
      },
    );

    if (!result.ok) {
      return c.json(
        {
          error: "envelope_rejected",
          code: result.code,
          message: result.message,
        },
        result.status,
      );
    }
    return c.json(result.response, 200);
  } catch (err) {
    if (err instanceof BankValidationError) {
      return c.json(err.body, 400);
    }
    throw err;
  } finally {
    client.release();
  }
}
