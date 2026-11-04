import { describe, expect, it } from "vitest";
import { parseApsEvent } from "../src/ingest/validate.js";
import { evaluationContextFromPayload } from "../src/policy/payload-context.js";

describe("anomaly_signal + evaluation context", () => {
  it("accepts anomaly_signal action_kind", () => {
    const event = parseApsEvent({
      schema_version: 1,
      event_id: "evt_anomaly_test_00000001",
      organization_id: "11111111-1111-4111-8111-111111111111",
      trace_id: "trc_anomaly_test",
      agent_id: "agt_test",
      key_id: "key_test",
      emitted_at: new Date().toISOString(),
      actor_type: "agent",
      actor_principal: "agent:test",
      action_kind: "anomaly_signal",
      policy_decision: "allow_with_obligation",
      payload: {
        type: "prompt_injection_indicator",
        reason: "Ignore previous instructions detected",
        severity: "high",
      },
      sig_alg: "ed25519",
      sig_value_b64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
    });
    expect(event.action_kind).toBe("anomaly_signal");
  });

  it("builds evaluation_context from customer context fields", () => {
    const ctx = evaluationContextFromPayload({
      segment: "gold",
      product_type: "refund",
      previous_pattern: "second_refund_7d",
      risk_tier: "medium",
      amount_usd: 249,
    });
    expect(ctx.customer_tier).toBe("gold");
    expect(ctx.product_type).toBe("refund");
    expect(ctx.previous_pattern).toBe("second_refund_7d");
    expect(ctx.risk_tier).toBe("medium");
  });

  it("accepts data_access with fields and sensitivity", () => {
    const event = parseApsEvent({
      schema_version: 1,
      event_id: "evt_data_access_test_00001",
      organization_id: "11111111-1111-4111-8111-111111111111",
      trace_id: "trc_data_access_test",
      agent_id: "agt_test",
      key_id: "key_test",
      emitted_at: new Date().toISOString(),
      actor_type: "agent",
      actor_principal: "agent:test",
      action_kind: "data_access",
      policy_decision: "allow",
      payload: {
        resource: "customer.profile",
        fields_accessed: ["email", "national_id"],
        sensitivity: "high",
        source: "retrieval",
      },
      sig_alg: "ed25519",
      sig_value_b64:
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
    });
    expect(event.action_kind).toBe("data_access");
  });

  it("rejects anomaly_signal without severity", () => {
    expect(() =>
      parseApsEvent({
        schema_version: 1,
        event_id: "evt_anomaly_bad_00000001",
        organization_id: "11111111-1111-4111-8111-111111111111",
        trace_id: "trc_anomaly_bad",
        agent_id: "agt_test",
        key_id: "key_test",
        emitted_at: new Date().toISOString(),
        actor_type: "agent",
        actor_principal: "agent:test",
        action_kind: "anomaly_signal",
        policy_decision: "allow",
        payload: {
          type: "unexpected_tool",
          reason: "missing severity",
        },
        sig_alg: "ed25519",
        sig_value_b64:
          "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
      }),
    ).toThrow(/severity/);
  });

  it("includes sensitivity in evaluation_context for data access", () => {
    const ctx = evaluationContextFromPayload({
      resource: "customer.profile",
      fields_accessed: ["email"],
      sensitivity: "high",
      segment: "standard",
    });
    expect(ctx.sensitivity).toBe("high");
    expect(ctx.resource).toBe("customer.profile");
    expect(ctx.fields_accessed).toEqual(["email"]);
    expect(ctx.customer_tier).toBe("standard");
  });
});
