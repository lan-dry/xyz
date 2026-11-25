import { randomUUID } from "node:crypto";
import { validateEvent } from "./schema.js";
import { lastEventId } from "./store.js";
import type { ApsEvent, RecordInput, RecordOptions } from "./types.js";

export interface RemoteRecordOptions extends RecordOptions {
  baseUrl: string;
  apiKey: string;
  traceId?: string;
  idempotencyKey?: string;
  /** When set, chain parent_event_id from this local NDJSON path before posting. */
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
  options: RecordOptions & { traceId?: string },
  parentEventId: string | null,
): ApsEvent {
  const event: ApsEvent = {
    schema_version: 1,
    event_id: options.event_id ?? randomUUID(),
    organization_id: input.organization_id ?? "local",
    trace_id: options.traceId ?? options.trace_id ?? randomUUID(),
    agent_id: input.agent_id ?? "agent:local",
    key_id: input.key_id ?? "key:local",
    emitted_at: options.emitted_at ?? options.recorded_at ?? new Date().toISOString(),
    actor_type: input.actor_type ?? "agent",
    actor_principal: input.actor_principal ?? "agent:local",
    action_kind: input.action_kind ?? "decision",
    policy_decision: input.policy_decision ?? "allow",
    payload: input.payload ?? {},
  };

  if (parentEventId) event.parent_event_id = parentEventId;
  if (input.policy_id) event.policy_id = input.policy_id;
  if (input.tool_name) event.tool_name = input.tool_name;
  if (input.sig_alg) event.sig_alg = input.sig_alg;
  if (input.sig_value_b64) event.sig_value_b64 = input.sig_value_b64;

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

  let parent: string | null = null;
  if (options.localChainStorePath) {
    const { readEvents } = await import("./store.js");
    parent = lastEventId(readEvents(options.localChainStorePath));
  }

  const event = buildEvent(input, options, parent);
  const traceId = options.traceId ?? event.trace_id;

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
