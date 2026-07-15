import { toolMatches } from "./match.js";

export type PolicyRuleInput = {
  rule_id: string;
  tool_pattern: string;
  decision: string;
  priority: number;
  conditions?: unknown;
};

export type PolicyDecisionResult =
  | "allow"
  | "deny"
  | "allow_with_obligation";

export type PolicyEvaluation = {
  decision: PolicyDecisionResult;
  policy_id: string;
  rule_id: string | null;
  reason: string;
};

export function evaluateRules(
  policyId: string,
  rules: PolicyRuleInput[],
  toolName: string,
): PolicyEvaluation {
  const matching = rules.filter((r) => toolMatches(r.tool_pattern, toolName));
  if (matching.length === 0) {
    return {
      decision: "allow",
      policy_id: policyId,
      rule_id: null,
      reason: "no matching rule (default allow)",
    };
  }

  matching.sort((a, b) => b.priority - a.priority);
  const topPriority = matching[0]!.priority;
  const top = matching.filter((r) => r.priority === topPriority);
  const deny = top.find((r) => r.decision === "deny");
  if (deny) {
    return {
      decision: "deny",
      policy_id: policyId,
      rule_id: deny.rule_id,
      reason: `denied by rule ${deny.rule_id}`,
    };
  }
  const obligation = top.find((r) => r.decision === "allow_with_obligation");
  if (obligation) {
    return {
      decision: "allow_with_obligation",
      policy_id: policyId,
      rule_id: obligation.rule_id,
      reason: `human approval required (${obligation.rule_id})`,
    };
  }
  const allow = top.find((r) => r.decision === "allow");
  if (allow) {
    return {
      decision: "allow",
      policy_id: policyId,
      rule_id: allow.rule_id,
      reason: `allowed by rule ${allow.rule_id}`,
    };
  }

  return {
    decision: "allow",
    policy_id: policyId,
    rule_id: null,
    reason: "no allow/deny at top priority (default allow)",
  };
}
