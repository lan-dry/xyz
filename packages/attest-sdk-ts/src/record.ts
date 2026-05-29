import { randomUUID } from "node:crypto";
import { eventHashFromBody } from "./canonical.js";
import { validateEvent } from "./schema.js";
import { appendEvent, lastEventHash, readEvents } from "./store.js";
import type { ApsEvent, ApsSignature, RecordInput, RecordOptions } from "./types.js";

const DEFAULT_SIGNATURE: ApsSignature = {
  alg: "local-placeholder",
  value: "placeholder:0000000000000000000000000000000000000000000000000000000000000000",
};

export interface RecordResult {
  event: ApsEvent;
  store_path: string;
}

/**
 * Append a validated APS-1 event to a local NDJSON ledger with hash chaining.
 */
export function record(
  storePath: string,
  input: RecordInput,
  options: RecordOptions = {},
): RecordResult {
  const existing = readEvents(storePath);
  const prev = lastEventHash(existing);

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
  appendEvent(storePath, event);
  return { event, store_path: storePath };
}
