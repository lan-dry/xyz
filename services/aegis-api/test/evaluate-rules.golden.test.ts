/**
 * Locks pre-forensic-demo evaluateRules behaviour.
 * Do not weaken these expectations. New combine=all_matching behaviour belongs in new tests.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluateRules, type PolicyRuleInput } from "../src/policy/evaluate-rules.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const goldenPath = join(
  root,
  "docs/baselines/pre-forensic-demo/evaluate-rules.golden.json",
);

type GoldenCase = {
  id: string;
  policy_id: string;
  tool: string;
  rules: PolicyRuleInput[];
  expected: {
    decision: string;
    rule_id: string | null;
    policy_id?: string;
    reason_contains?: string;
  };
};

const golden = JSON.parse(readFileSync(goldenPath, "utf8")) as {
  cases: GoldenCase[];
};

describe("evaluateRules golden baseline (pre-forensic-demo)", () => {
  for (const c of golden.cases) {
    it(c.id, () => {
      const result = evaluateRules(c.policy_id, c.rules, c.tool);
      expect(result.decision).toBe(c.expected.decision);
      expect(result.rule_id).toBe(c.expected.rule_id);
      if (c.expected.policy_id) {
        expect(result.policy_id).toBe(c.expected.policy_id);
      }
      if (c.expected.reason_contains) {
        expect(result.reason).toContain(c.expected.reason_contains);
      }
    });
  }
});
