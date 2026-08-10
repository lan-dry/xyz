import type { EventDetail } from "../repo/events.js";

export type ReplayStep = {
  step_index: number;
  event_id: string;
  span_id: string | null;
  action_kind: string;
  policy_decision: string;
  tool_name: string | null;
  summary: string;
  emitted_at: string | null;
  payload_preview: Record<string, unknown> | null;
  /** Audit step-through always available; external side-effects need local re-run. */
  mode: "audit" | "local_rerun";
  local_hint: string | null;
};

export function buildReplayManifest(events: EventDetail[]): {
  trace_id: string;
  step_count: number;
  reconstruction_ms: number;
  steps: ReplayStep[];
  disclaimer: string;
} {
  const started = performance.now();
  const traceId = events[0]?.trace_id ?? "";
  const steps: ReplayStep[] = events.map((e, index) => {
    const payload =
      e.payload && typeof e.payload === "object"
        ? (e.payload as Record<string, unknown>)
        : {};
    const spanId =
      typeof payload.span_id === "string" ? payload.span_id : null;
    const purpose = payload.purpose ?? payload.action ?? e.action_kind;
    const summary = e.tool_name
      ? `${e.action_kind}: ${e.tool_name} → ${e.policy_decision}`
      : `${e.action_kind}: ${String(purpose)} → ${e.policy_decision}`;

    const preview: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (value == null || typeof value === "object") continue;
      preview[key] = value;
      if (Object.keys(preview).length >= 8) break;
    }

    const sideEffect =
      e.action_kind === "tool_call" ||
      e.action_kind === "policy_decision" ||
      e.action_kind === "result";
    const llm = e.action_kind === "llm_invocation";

    return {
      step_index: index + 1,
      event_id: e.event_id,
      span_id: spanId,
      action_kind: e.action_kind,
      policy_decision: e.policy_decision,
      tool_name: e.tool_name,
      summary: String(summary),
      emitted_at: e.emitted_at instanceof Date ? e.emitted_at.toISOString() : null,
      payload_preview: Object.keys(preview).length > 0 ? preview : null,
      mode: sideEffect || llm ? "local_rerun" : "audit",
      local_hint:
        llm || sideEffect
          ? "Re-execution is not run in the cloud. Use the replay manifest with your agent runtime (e.g. pnpm pilot:agent) and the same signing keys."
          : null,
    };
  });

  return {
    trace_id: traceId,
    step_count: steps.length,
    reconstruction_ms: Math.round(performance.now() - started),
    steps,
    disclaimer:
      "Interactive reconstruction walks the signed causal chain in order. Pick any step to inspect payload fields. Re-running side-effectful tools happens in your environment (local_rerun), not on Salanor servers.",
  };
}
