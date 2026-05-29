import { canonicalize, sha256Hex } from "./canonical.js";
import { readEvents } from "./store.js";
import type { ApsEvent, ReplayResult, ReplayStep } from "./types.js";

const TIER_A_ACTIONS = new Set(["decision.record"]);

function reconstructTierA(event: ApsEvent): ReplayStep["reconstructed"] {
  const ctx = event.context;
  return {
    inputs: structuredClone(ctx.inputs ?? {}),
    model: ctx.model as Record<string, unknown> | undefined,
    policy: ctx.policy as Record<string, unknown> | undefined,
    outcome: structuredClone(ctx.outcome ?? {}),
  };
}

/**
 * Deterministic Tier-A replay: same ledger bytes → same digest.
 */
export function replay(storePath: string, traceId = "local"): ReplayResult {
  const events = readEvents(storePath);
  const steps: ReplayStep[] = [];

  for (const event of events) {
    if (!TIER_A_ACTIONS.has(event.action)) {
      continue;
    }
    steps.push({
      event_id: event.event_id,
      action: event.action,
      subject: event.subject,
      tier: "A",
      reconstructed: reconstructTierA(event),
    });
  }

  const digest = `sha256:${sha256Hex(canonicalize({ trace_id: traceId, steps }))}`;
  return { trace_id: traceId, steps, digest };
}
