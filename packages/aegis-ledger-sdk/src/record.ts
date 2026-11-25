import { randomUUID } from "node:crypto";
import { eventDigest } from "./canonical.js";
import { validateEvent } from "./schema.js";
import { appendEvent, lastEventId, readEvents } from "./store.js";
import type { ApsEvent, RecordInput, RecordOptions } from "./types.js";

export interface RecordResult {
  event: ApsEvent;
  store_path: string;
  /** Content digest of the sealed event (for merkle / chain verify). */
  event_hash: string;
}

/**
 * Append a validated APS-1 event to a local NDJSON ledger with parent_event_id chaining.
 */
export function record(
  storePath: string,
  input: RecordInput,
  options: RecordOptions = {},
): RecordResult {
  const existing = readEvents(storePath);
  const prevId = lastEventId(existing);
  const parent =
    input.parent_event_id === null
      ? undefined
      : (input.parent_event_id ?? prevId ?? undefined);

  const event: ApsEvent = {
    schema_version: 1,
    event_id: options.event_id ?? randomUUID(),
    organization_id: input.organization_id ?? "local",
    trace_id: options.trace_id ?? randomUUID(),
    agent_id: input.agent_id ?? "agent:local",
    key_id: input.key_id ?? "key:local",
    emitted_at: options.emitted_at ?? options.recorded_at ?? new Date().toISOString(),
    actor_type: input.actor_type ?? "agent",
    actor_principal: input.actor_principal ?? "agent:local",
    action_kind: input.action_kind ?? "decision",
    policy_decision: input.policy_decision ?? "allow",
    payload: input.payload ?? {},
  };

  if (parent) event.parent_event_id = parent;
  if (input.policy_id) event.policy_id = input.policy_id;
  if (input.tool_name) event.tool_name = input.tool_name;
  if (input.span_id) event.span_id = input.span_id;
  if (input.parent_span_id) event.parent_span_id = input.parent_span_id;
  if (input.sig_alg) event.sig_alg = input.sig_alg;
  if (input.sig_value_b64) event.sig_value_b64 = input.sig_value_b64;

  validateEvent(event);
  appendEvent(storePath, event);
  return { event, store_path: storePath, event_hash: eventDigest(event) };
}
