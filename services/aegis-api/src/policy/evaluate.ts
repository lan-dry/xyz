import type pg from "pg";
import { getActivePolicyWithRules } from "../repo/policies.js";
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
    return c?.rule_type === "max_per_tx" || c?.rule_type === "max_daily_total";
  });
}

export async function evaluateToolPolicy(
  client: pg.Pool | pg.PoolClient,
  input: EvaluateInput,
): Promise<EvaluateOutput> {
  const active = await getActivePolicyWithRules(client, input.organizationId);
  if (!active) {
    return {
      decision: "allow",
      policy_id: "none",
      rule_id: null,
      reason: "no active policy (default allow)",
      engine: "rules",
    };
  }

  const rules = active.rules.map((r) => ({
    rule_id: r.rule_id,
    tool_pattern: r.tool_pattern,
    decision: r.decision,
    priority: r.priority,
    conditions: r.conditions,
  }));

  const evalContext = {
    toolName: input.toolName,
    payload: input.payload,
    organizationId: input.organizationId,
  };

  if (rulesNeedConditionEngine(rules)) {
    const rulesResult = await evaluateRulesWithConditions(
      client,
      active.policy.policy_id,
      rules,
      evalContext,
    );
    return { ...rulesResult, engine: "rules" };
  }

  const opaResult = await evaluateWithOpa(
    active.policy.policy_id,
    rules,
    input.toolName,
    active.policy.wasm_artifact,
  );
  if (opaResult) {
    return { ...opaResult, engine: "opa" };
  }

  const rulesResult = await evaluateRulesWithConditions(
    client,
    active.policy.policy_id,
    rules,
    evalContext,
  );
  return { ...rulesResult, engine: "rules" };
}
