import { canonicalize, sha256Hex } from "./canonical.js";
import { readEvents } from "./store.js";
import type { ApsEvent, ReplayResult, ReplayStep } from "./types.js";

const TIER_A_KINDS = new Set(["decision", "policy_decision"]);

function subjectFromPayload(event: ApsEvent): { type: string; id: string } {
  const subject = event.payload?.subject;
  if (
    subject &&
    typeof subject === "object" &&
    typeof (subject as { type?: unknown }).type === "string" &&
    typeof (subject as { id?: unknown }).id === "string"
  ) {
    return subject as { type: string; id: string };
  }
  return { type: "event", id: event.event_id };
}

function reconstructTierA(event: ApsEvent): ReplayStep["reconstructed"] {
  const payload = event.payload ?? {};
  return {
    inputs: structuredClone((payload.inputs as Record<string, unknown>) ?? {}),
    model: payload.model as Record<string, unknown> | undefined,
    policy: payload.policy as Record<string, unknown> | undefined,
    outcome: structuredClone((payload.outcome as Record<string, unknown>) ?? {}),
  };
}

/**
 * Deterministic Tier-A replay: same ledger bytes → same digest.
 */
export function replay(storePath: string, traceId = "local"): ReplayResult {
  const events = readEvents(storePath);
  const steps: ReplayStep[] = [];

  for (const event of events) {
    if (!TIER_A_KINDS.has(event.action_kind)) {
      continue;
    }
    steps.push({
      event_id: event.event_id,
      action: event.action_kind,
      subject: subjectFromPayload(event),
      tier: "A",
      reconstructed: reconstructTierA(event),
    });
  }

  const digest = `sha256:${sha256Hex(canonicalize({ trace_id: traceId, steps }))}`;
  return { trace_id: traceId, steps, digest };
}
