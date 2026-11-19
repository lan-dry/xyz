/**
 * POST /v1/aegis/collector-events — AEGIS-SRC1 envelopes from an independent
 * collector (source kind = collector). Does not run the bank decision path.
 */
import { randomUUID } from "node:crypto";
import type { Context } from "hono";
import {
  checkRateLimit,
  getClientIp,
  ingestRateLimitKey,
  rateLimitResponse,
  readRateLimitEnv,
} from "@salanor/platform-auth";
import { resolveIngestKey } from "../auth/ingest-key.js";
import { getPool } from "../db/pool.js";
import { verifyAndAcceptEnvelope } from "../sources/verify-and-accept.js";

function bearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function postCollectorEvent(c: Context): Promise<Response> {
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

  const client = await getPool().connect();
  try {
    const auth = await resolveIngestKey(client, token);
    if (!auth) {
      return c.json({ error: "Invalid API key" }, 401);
    }

    const result = await verifyAndAcceptEnvelope(
      client,
      auth.organizationId,
      body,
      {
        process: async (accepted) => {
          if (accepted.source.kind !== "collector") {
            return {
              error: true as const,
              status: 403 as const,
              code: "source_not_collector",
              message:
                "collector-events accepts only sources with kind=collector",
            };
          }
          const event = accepted.envelope.event;
          if (!isPlainObject(event) || event.event_type !== "cdc.row_change") {
            return {
              error: true as const,
              status: 400 as const,
              code: "invalid_collector_event",
              message: 'event.event_type must be "cdc.row_change"',
            };
          }
          const attrs = isPlainObject(event.attributes)
            ? event.attributes
            : null;
          const cdc = attrs && isPlainObject(attrs.cdc) ? attrs.cdc : null;
          if (!cdc) {
            return {
              error: true as const,
              status: 400 as const,
              code: "invalid_collector_event",
              message: "event.attributes.cdc is required",
            };
          }
          const schema =
            typeof cdc.schema === "string" ? cdc.schema : "public";
          const table = typeof cdc.table === "string" ? cdc.table : "";
          const operation =
            typeof cdc.operation === "string" ? cdc.operation : "";
          const lsn = typeof cdc.lsn === "string" ? cdc.lsn : "";
          const new_values_hash =
            typeof cdc.new_values_hash === "string" ? cdc.new_values_hash : "";
          const row_key = isPlainObject(cdc.row_key) ? cdc.row_key : {};
          if (!table || !operation || !lsn) {
            return {
              error: true as const,
              status: 400 as const,
              code: "invalid_collector_event",
              message: "cdc.table, cdc.operation, and cdc.lsn are required",
            };
          }
          if (
            !["insert", "update", "delete", "truncate"].includes(operation)
          ) {
            return {
              error: true as const,
              status: 400 as const,
              code: "invalid_collector_event",
              message: "cdc.operation must be insert|update|delete|truncate",
            };
          }

          const caseId =
            typeof event.case_id === "string" && event.case_id.trim()
              ? event.case_id.trim()
              : null;
          const eventId = `cdc_${randomUUID()}`;
          const capturedAt =
            typeof event.emitted_at === "string"
              ? event.emitted_at
              : accepted.envelope.ts;

          await client.query(
            `INSERT INTO collector_cdc_event (
               event_id, organization_id, source_id, key_id, case_id,
               schema_name, table_name, operation, row_key, new_values_hash, lsn,
               envelope_seq, event_hash, idempotency_key, captured_at
             ) VALUES (
               $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15::timestamptz
             )
             ON CONFLICT (organization_id, source_id, idempotency_key) DO NOTHING`,
            [
              eventId,
              auth.organizationId,
              accepted.source.source_id,
              accepted.key.key_id,
              caseId,
              schema,
              table,
              operation,
              JSON.stringify(row_key),
              new_values_hash,
              lsn,
              accepted.envelope.seq,
              accepted.envelope.event_hash,
              accepted.envelope.idempotency_key,
              capturedAt,
            ],
          );

          return {
            error: false as const,
            event_id: eventId,
            source_id: accepted.source.source_id,
            case_id: caseId,
            lsn,
          };
        },
      },
    );

    if (!result.ok) {
      return c.json(
        { error: result.code, message: result.message },
        result.status,
      );
    }
    if (result.idempotent) {
      return c.json(result.response, 200);
    }
    const bodyOut = result.response as {
      error?: boolean;
      status?: number;
      code?: string;
      message?: string;
      event_id?: string;
      source_id?: string;
      case_id?: string | null;
      lsn?: string;
    };
    if (bodyOut.error) {
      return c.json(
        { error: bodyOut.code, message: bodyOut.message },
        (bodyOut.status ?? 400) as 400 | 403,
      );
    }
    return c.json(
      {
        ok: true,
        event_id: bodyOut.event_id,
        source_id: bodyOut.source_id,
        case_id: bodyOut.case_id,
        lsn: bodyOut.lsn,
      },
      202,
    );
  } finally {
    client.release();
  }
}
