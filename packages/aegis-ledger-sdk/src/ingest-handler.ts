import { randomUUID } from "node:crypto";
import { validateEvent, ApsValidationError } from "./schema";
import type { ApsEvent } from "./types";

export interface IngestLogEntry {
  level: "info" | "warn" | "error";
  trace_id: string;
  event_id?: string;
  msg: string;
}

export interface IngestPersistInput {
  traceId: string;
  payload: ApsEvent;
  idempotencyKey?: string;
}

export interface IngestPersistResult {
  rowId: string;
  eventId: string;
  traceId: string;
  created: boolean;
}

export interface AegisIngestStore {
  findByIdempotencyKey(key: string): Promise<IngestPersistResult | null>;
  create(input: IngestPersistInput): Promise<IngestPersistResult>;
}

/** P3 bus path — durable JetStream publish (ledger worker is sole Postgres writer). */
export interface AegisIngestPublisher {
  publish(input: IngestPersistInput): Promise<IngestPersistResult>;
}

export type IngestAuthResult =
  | { ok: true }
  | { ok: false; status: 401; message: string };

export function verifyIngestApiKey(
  headers: Headers,
  expectedKey: string | undefined,
): IngestAuthResult {
  const key = expectedKey?.trim();
  if (!key) {
    return { ok: false, status: 401, message: "Ingest API is not configured." };
  }

  const bearer = headers.get("authorization");
  const headerKey = headers.get("x-aegis-api-key");
  let provided: string | null = null;

  if (bearer?.startsWith("Bearer ")) {
    provided = bearer.slice("Bearer ".length).trim();
  } else if (headerKey?.trim()) {
    provided = headerKey.trim();
  }

  if (!provided || provided !== key) {
    return { ok: false, status: 401, message: "Unauthorized." };
  }

  return { ok: true };
}

export function resolveTraceId(headers: Headers): string {
  const fromHeader = headers.get("x-trace-id")?.trim();
  if (fromHeader && isUuid(fromHeader)) {
    return fromHeader;
  }
  return randomUUID();
}

export function parseIdempotencyKey(headers: Headers, body: unknown): string | undefined {
  const fromHeader = headers.get("idempotency-key")?.trim();
  if (fromHeader && fromHeader.length <= 256) {
    return fromHeader;
  }
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const raw = (body as Record<string, unknown>).idempotency_key;
    if (typeof raw === "string" && raw.trim() && raw.trim().length <= 256) {
      return raw.trim();
    }
  }
  return undefined;
}

export type IngestBodyResult =
  | { ok: true; event: ApsEvent }
  | { ok: false; status: 400; message: string; details?: string[] };

export function parseIngestBody(body: unknown): IngestBodyResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, message: "Request body must be a JSON object." };
  }

  const record = body as Record<string, unknown>;
  const { idempotency_key: _ignored, ...eventFields } = record;

  let event: ApsEvent;
  try {
    event = validateEvent(eventFields);
  } catch (err) {
    if (err instanceof ApsValidationError) {
      return {
        ok: false,
        status: 400,
        message: err.message,
        details: err.details,
      };
    }
    throw err;
  }

  return { ok: true, event };
}

export type HandleIngestResult =
  | { ok: true; status: 201; event_id: string; trace_id: string; created: boolean }
  | { ok: false; status: number; message: string; details?: string[] };

export async function handleIngest(params: {
  headers: Headers;
  body: unknown;
  expectedApiKey: string | undefined;
  /** P2 direct Postgres write when publisher is omitted. */
  store?: AegisIngestStore;
  /** P3 JetStream publish; use with store for idempotency reads only. */
  publisher?: AegisIngestPublisher;
  log?: (entry: IngestLogEntry) => void;
}): Promise<HandleIngestResult> {
  const log = params.log ?? (() => undefined);
  const traceId = resolveTraceId(params.headers);

  const auth = verifyIngestApiKey(params.headers, params.expectedApiKey);
  if (!auth.ok) {
    log({ level: "warn", trace_id: traceId, msg: "ingest_unauthorized" });
    return { ok: false, status: auth.status, message: auth.message };
  }

  const parsed = parseIngestBody(params.body);
  if (!parsed.ok) {
    log({ level: "warn", trace_id: traceId, msg: "ingest_invalid_payload" });
    return {
      ok: false,
      status: parsed.status,
      message: parsed.message,
      details: parsed.details,
    };
  }

  if (!params.store && !params.publisher) {
    throw new Error("handleIngest requires store and/or publisher");
  }

  const idempotencyKey = parseIdempotencyKey(params.headers, params.body);

  if (idempotencyKey && params.store) {
    const existing = await params.store.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      log({
        level: "info",
        trace_id: existing.traceId,
        event_id: existing.eventId,
        msg: "ingest_idempotent_replay",
      });
      return {
        ok: true,
        status: 201,
        event_id: existing.eventId,
        trace_id: existing.traceId,
        created: false,
      };
    }
  }

  const persistInput: IngestPersistInput = {
    traceId,
    payload: parsed.event,
    idempotencyKey,
  };

  try {
    if (params.publisher) {
      if (!params.store) {
        throw new Error("handleIngest bus mode requires store for idempotency reads");
      }
      const published = await params.publisher.publish(persistInput);
      log({
        level: "info",
        trace_id: published.traceId,
        event_id: published.eventId,
        msg: "ingest_published",
      });
      return {
        ok: true,
        status: 201,
        event_id: published.eventId,
        trace_id: published.traceId,
        created: published.created,
      };
    }

    const saved = await params.store!.create(persistInput);

    log({
      level: "info",
      trace_id: saved.traceId,
      event_id: saved.eventId,
      msg: saved.created ? "ingest_persisted" : "ingest_idempotent_replay",
    });

    return {
      ok: true,
      status: 201,
      event_id: saved.eventId,
      trace_id: saved.traceId,
      created: saved.created,
    };
  } catch (err) {
    log({
      level: "error",
      trace_id: traceId,
      msg: params.publisher ? "ingest_publish_failed" : "ingest_persist_failed",
    });
    throw err;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
