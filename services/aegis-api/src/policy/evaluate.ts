import type pg from "pg";
import { getActivePoliciesWithRules } from "../repo/policies.js";
import { parseConditions } from "./amount.js";
import { evaluateRulesWithConditions } from "./evaluate-conditions.js";
import { evaluateWithOpa } from "./evaluate-opa.js";
import type { PolicyRuleInput } from "./evaluate-rules.js";

export type EvaluateInput = {
  organizationId: string;
  agentId: string;
  toolName: string;
  payload?: Record<string, unknown>;
};

export type EvaluateOutput = {
  decision: "allow" | "deny" | "allow_with_obligation";
  policy_id: string;
  rule_id: string | null;
  reason: string;
  engine: "opa" | "rules";
};

function rulesNeedConditionEngine(rules: PolicyRuleInput[]): boolean {
  return rules.some((r) => {
    const c = parseConditions(r.conditions);
    return (
      c?.rule_type === "max_per_tx" ||
      c?.rule_type === "min_per_tx" ||
      c?.rule_type === "max_daily_total"
    );
  });
}

export async function evaluateToolPolicy(
  client: pg.Pool | pg.PoolClient,
  input: EvaluateInput,
): Promise<EvaluateOutput> {
  const actives = await getActivePoliciesWithRules(client, input.organizationId);
  if (actives.length === 0) {
    return {
      decision: "allow",
      policy_id: "none",
      rule_id: null,
      reason: "no active policy (default allow)",
      engine: "rules",
    };
  }

  const rules: PolicyRuleInput[] = actives.flatMap(({ policy, rules: policyRules }) =>
    policyRules.map((r) => ({
      rule_id: r.rule_id,
      tool_pattern: r.tool_pattern,
      decision: r.decision,
      priority: r.priority,
      conditions: r.conditions,
      policy_id: policy.policy_id,
    })),
  );

  const fallbackPolicyId = actives[0]!.policy.policy_id;

  const evalContext = {
    toolName: input.toolName,
    payload: input.payload,
    organizationId: input.organizationId,
  };

  if (rulesNeedConditionEngine(rules)) {
    const rulesResult = await evaluateRulesWithConditions(
      client,
      fallbackPolicyId,
      rules,
      evalContext,
    );
    return { ...rulesResult, engine: "rules" };
  }

  if (actives.length === 1) {
    const single = actives[0]!;
    const opaResult = await evaluateWithOpa(
      single.policy.policy_id,
      rules,
      input.toolName,
      single.policy.wasm_artifact,
    );
    if (opaResult) {
      return { ...opaResult, engine: "opa" };
    }
  }

  const rulesResult = await evaluateRulesWithConditions(
    client,
    fallbackPolicyId,
    rules,
    evalContext,
  );
  return { ...rulesResult, engine: "rules" };
}
