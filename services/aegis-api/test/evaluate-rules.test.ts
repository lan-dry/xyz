import { describe, expect, it } from "vitest";
import { evaluateRules } from "../src/policy/evaluate-rules.js";

describe("evaluateRules", () => {
  it("deny wins over allow for same tool", () => {
    const result = evaluateRules(
      "pol_test",
      [
        {
          rule_id: "r1",
          tool_pattern: "stripe.paymentIntents.create",
          decision: "allow",
          priority: 10,
        },
        {
          rule_id: "r2",
          tool_pattern: "stripe.paymentIntents.create",
          decision: "deny",
          priority: 10,
        },
      ],
      "stripe.paymentIntents.create",
    );
    expect(result.decision).toBe("deny");
    expect(result.rule_id).toBe("r2");
  });

  it("returns allow_with_obligation when rule matches", () => {
    const result = evaluateRules(
      "pol_test",
      [
        {
          rule_id: "obl",
          tool_pattern: "payments.wire.transfer",
          decision: "allow_with_obligation",
          priority: 50,
        },
      ],
      "payments.wire.transfer",
    );
    expect(result.decision).toBe("allow_with_obligation");
  });

  it("higher priority allow overrides lower deny", () => {
    const result = evaluateRules(
      "pol_test",
      [
        {
          rule_id: "deny_low",
          tool_pattern: "demo.echo",
          decision: "deny",
          priority: 1,
        },
        {
          rule_id: "allow_high",
          tool_pattern: "demo.echo",
          decision: "allow",
          priority: 100,
        },
      ],
      "demo.echo",
    );
    expect(result.decision).toBe("allow");
    expect(result.rule_id).toBe("allow_high");
  });
});
