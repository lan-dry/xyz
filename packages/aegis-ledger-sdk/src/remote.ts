import { randomUUID } from "node:crypto";
import { eventHashFromBody } from "./canonical.js";
import { validateEvent } from "./schema.js";
import { lastEventHash } from "./store.js";
import type { ApsEvent, RecordInput, RecordOptions } from "./types.js";

const DEFAULT_SIGNATURE = {
  alg: "local-placeholder" as const,
  value:
    "placeholder:0000000000000000000000000000000000000000000000000000000000000000",
};

export interface RemoteRecordOptions extends RecordOptions {
  baseUrl: string;
  apiKey: string;
  traceId?: string;
  idempotencyKey?: string;
  /** When set, chain prev hash from this local NDJSON path before posting. */
  localChainStorePath?: string;
  fetchImpl?: typeof fetch;
}

export interface RemoteRecordResult {
  event_id: string;
  trace_id: string;
  event: ApsEvent;
}

export class AegisRemoteError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "AegisRemoteError";
  }
}

function buildEvent(
  input: RecordInput,
  options: RecordOptions,
  prev: string | null,
): ApsEvent {
  const body: Omit<ApsEvent, "chain"> & { chain: { prev_event_hash: string | null } } = {
    aps_version: "0.1",
    event_id: options.event_id ?? randomUUID(),
    recorded_at: options.recorded_at ?? new Date().toISOString(),
    tenant_id: input.tenant_id ?? "local",
    actor: input.actor,
    action: input.action,
    subject: input.subject,
    context: input.context,
    signature: input.signature ?? DEFAULT_SIGNATURE,
    chain: { prev_event_hash: prev },
  };

  const event_hash = eventHashFromBody(body as unknown as Record<string, unknown>);
  const event: ApsEvent = {
    ...body,
    chain: { prev_event_hash: prev, event_hash },
  };

  validateEvent(event);
  return event;
}

/**
 * Build a validated APS event and POST it to the cloud ingest endpoint (P2).
 */
export async function remoteRecord(
  input: RecordInput,
  options: RemoteRecordOptions,
): Promise<RemoteRecordResult> {
  const fetchFn = options.fetchImpl ?? fetch;
  const base = options.baseUrl.replace(/\/$/, "");
  const url = `${base}/api/aegis/ingest`;

  let prev: string | null = null;
  if (options.localChainStorePath) {
    const { readEvents } = await import("./store.js");
    prev = lastEventHash(readEvents(options.localChainStorePath));
  }

  const event = buildEvent(input, options, prev);
  const traceId = options.traceId ?? randomUUID();

  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${options.apiKey}`,
    "x-trace-id": traceId,
  };
  if (options.idempotencyKey) {
    headers["idempotency-key"] = options.idempotencyKey;
  }

  const res = await fetchFn(url, {
    method: "POST",
    headers,
    body: JSON.stringify(event),
  });

  let body: unknown;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { raw: text };
    }
  }

  if (!res.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : `Ingest failed with status ${res.status}`;
    throw new AegisRemoteError(message, res.status, body);
  }

  const parsed = body as { event_id?: string; trace_id?: string };
  if (!parsed?.event_id || !parsed?.trace_id) {
    throw new AegisRemoteError("Ingest response missing event_id or trace_id", res.status, body);
  }

  return {
    event_id: parsed.event_id,
    trace_id: parsed.trace_id,
    event,
  };
}
