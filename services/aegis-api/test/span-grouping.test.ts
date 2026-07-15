import { describe, expect, it } from "vitest";
import { groupEventsIntoSpans } from "../src/trace/span-grouping.js";

describe("groupEventsIntoSpans", () => {
  it("groups consecutive events with the same span_id", () => {
    const groups = groupEventsIntoSpans([
      {
        event_id: "e1",
        sequence_num: 1,
        action_kind: "tool_call",
        policy_decision: "allow",
        tool_name: "aegis.trace.start",
        payload: { span_id: "spn_a", span_label: "Session" },
      },
      {
        event_id: "e2",
        sequence_num: 2,
        action_kind: "llm_invocation",
        policy_decision: "allow",
        tool_name: "gemini",
        payload: { span_id: "spn_b", span_label: "Triage" },
      },
      {
        event_id: "e3",
        sequence_num: 3,
        action_kind: "llm_invocation",
        policy_decision: "allow",
        tool_name: "gemini",
        payload: { span_id: "spn_b", span_label: "Triage" },
      },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]!.span_id).toBe("spn_a");
    expect(groups[1]!.events).toHaveLength(2);
  });
});
