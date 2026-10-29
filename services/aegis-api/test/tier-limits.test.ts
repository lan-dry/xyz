import { describe, expect, it } from "vitest";
import { evaluateRulesWithConditions } from "../src/policy/evaluate-conditions.js";
import type { PolicyRuleInput } from "../src/policy/evaluate-rules.js";

const fakeClient = {
  query: async () => ({ rows: [] }),
} as never;

const tierRule: PolicyRuleInput = {
  rule_id: "rule_tier",
  tool_pattern: "stripe.paymentIntents.create",
  decision: "allow_with_obligation",
  priority: 200,
  conditions: {
    rule_type: "max_per_tx",
    layer: "contextual",
    limit_source: "segment_table",
    segment_limits: { standard: 200, gold: 1000, business: 5000 },
    on_lookup_fail: "allow_with_obligation",
    when: { account_type: "consumer" },
  },
};

const ceilingRule: PolicyRuleInput = {
  rule_id: "rule_ceiling",
  tool_pattern: "stripe.paymentIntents.create",
  decision: "deny",
  priority: 900,
  conditions: {
    rule_type: "max_per_tx",
    layer: "ceiling",
    limit_source: "fixed",
    max_amount_usd: 5000,
  },
};

describe("Phase 2 tier + ceiling evaluation", () => {
  it("asks a person for Standard $249", async () => {
    const result = await evaluateRulesWithConditions(
      fakeClient,
      "pol_test",
      [ceilingRule, tierRule],
      {
        organizationId: "org",
        toolName: "stripe.paymentIntents.create",
        payload: {
          amount_usd: 249,
          segment: "standard",
          account_type: "consumer",
        },
      },
    );
    expect(result.decision).toBe("allow_with_obligation");
    expect(result.decision_layer).toBe("contextual");
  });

  it("allows Gold $249", async () => {
    const result = await evaluateRulesWithConditions(
      fakeClient,
      "pol_test",
      [ceilingRule, tierRule],
      {
        organizationId: "org",
        toolName: "stripe.paymentIntents.create",
        payload: {
          amount_usd: 249,
          segment: "gold",
          account_type: "consumer",
        },
      },
    );
    expect(result.decision).toBe("allow");
    expect(result.decision_layer).toBe("default");
  });

  it("maps retail → standard for Ask a person", async () => {
    const result = await evaluateRulesWithConditions(
      fakeClient,
      "pol_test",
      [tierRule],
      {
        organizationId: "org",
        toolName: "stripe.paymentIntents.create",
        payload: {
          amount_usd: 249,
          segment: "retail",
          account_type: "consumer",
        },
      },
    );
    expect(result.decision).toBe("allow_with_obligation");
  });

  it("hard ceiling stops even when contextual would allow", async () => {
    const result = await evaluateRulesWithConditions(
      fakeClient,
      "pol_test",
      [ceilingRule, tierRule],
      {
        organizationId: "org",
        toolName: "stripe.paymentIntents.create",
        payload: {
          amount_usd: 6000,
          segment: "business",
          account_type: "consumer",
        },
      },
    );
    expect(result.decision).toBe("deny");
    expect(result.decision_layer).toBe("ceiling");
    expect(result.reason).toMatch(/5000/);
  });

  it("lookup fail asks a person", async () => {
    const result = await evaluateRulesWithConditions(
      fakeClient,
      "pol_test",
      [tierRule],
      {
        organizationId: "org",
        toolName: "stripe.paymentIntents.create",
        payload: {
          amount_usd: 249,
          account_type: "consumer",
        },
      },
    );
    expect(result.decision).toBe("allow_with_obligation");
    expect(result.reason).toMatch(/asking a person/i);
  });

  it("records risk_score signals on evaluation", async () => {
    const result = await evaluateRulesWithConditions(
      fakeClient,
      "pol_test",
      [tierRule],
      {
        organizationId: "org",
        toolName: "stripe.paymentIntents.create",
        payload: {
          amount_usd: 50,
          segment: "gold",
          account_type: "consumer",
          risk_score: 72,
          model_name: "fraud-v3",
          model_version: "3.4",
        },
      },
    );
    expect(result.decision).toBe("allow");
    expect(result.signals?.risk_score).toBe(72);
    expect(result.signals?.model_name).toBe("fraud-v3");
  });
});
