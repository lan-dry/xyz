import { describe, expect, it } from "vitest";
import {
  evaluateRules,
  evaluateRulesWithCombine,
} from "../src/policy/evaluate-rules.js";

describe("evaluateRulesWithCombine all_matching", () => {
  it("lists every matched rule and prefers deny over hold", () => {
    const result = evaluateRulesWithCombine(
      "pol_bank",
      [
        {
          rule_id: "AUTH-RL",
          tool_pattern: "bank.loan.decide",
          decision: "allow",
          priority: 10,
        },
        {
          rule_id: "LN-07",
          tool_pattern: "bank.loan.decide",
          decision: "allow_with_obligation",
          priority: 20,
        },
        {
          rule_id: "HARD",
          tool_pattern: "bank.loan.decide",
          decision: "deny",
          priority: 5,
          conditions: { hard_stop: true },
        },
      ],
      "bank.loan.decide",
      "all_matching",
    );
    expect(result.decision).toBe("deny");
    expect(result.matched_rules.map((m) => m.rule_id).sort()).toEqual([
      "AUTH-RL",
      "HARD",
      "LN-07",
    ]);
    expect(result.combine).toBe("all_matching");
  });

  it("unions holds when no deny", () => {
    const result = evaluateRulesWithCombine(
      "pol_bank",
      [
        {
          rule_id: "A",
          tool_pattern: "bank.loan.decide",
          decision: "allow_with_obligation",
          priority: 1,
        },
        {
          rule_id: "B",
          tool_pattern: "bank.loan.decide",
          decision: "allow",
          priority: 2,
        },
      ],
      "bank.loan.decide",
      "all_matching",
    );
    expect(result.decision).toBe("allow_with_obligation");
    expect(result.matched_rules).toHaveLength(2);
    expect(result.reason).toContain("A");
  });

  it("default evaluateRules stays top_priority (legacy)", () => {
    const legacy = evaluateRules(
      "pol",
      [
        {
          rule_id: "low_deny",
          tool_pattern: "x",
          decision: "deny",
          priority: 1,
        },
        {
          rule_id: "high_allow",
          tool_pattern: "x",
          decision: "allow",
          priority: 100,
        },
      ],
      "x",
    );
    expect(legacy.decision).toBe("allow");
    expect(legacy.rule_id).toBe("high_allow");
  });
});
