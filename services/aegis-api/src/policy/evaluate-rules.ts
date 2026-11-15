import { toolMatches } from "./match.js";

export type PolicyRuleInput = {
  rule_id: string;
  tool_pattern: string;
  decision: string;
  priority: number;
  conditions?: unknown;
  /** Source policy when rules from multiple active bundles are merged. */
  policy_id?: string;
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
  /** Claude §12.3 — which layer decided (ceiling / contextual / override). */
  decision_layer?: "ceiling" | "contextual" | "override" | "default";
  /** Echo of external signals recorded for the receipt (§12.5 start). */
  signals?: Record<string, unknown>;
};

export type RuleCombineMode = "top_priority" | "all_matching";

export type MatchedRule = {
  rule_id: string;
  policy_id: string;
  decision: PolicyDecisionResult;
  priority: number;
  hard_stop?: boolean;
};

export type PolicyEvaluationExtended = PolicyEvaluation & {
  matched_rules: MatchedRule[];
  combine: RuleCombineMode;
};

/**
 * Default (legacy) behaviour: among matching rules, only the top priority band
 * competes; deny > allow_with_obligation > allow within that band.
 * Golden baseline: docs/baselines/pre-forensic-demo/evaluate-rules.golden.json
 */
export function evaluateRules(
  policyId: string,
  rules: PolicyRuleInput[],
  toolName: string,
): PolicyEvaluation {
  return evaluateRulesWithCombine(policyId, rules, toolName, "top_priority");
}

/**
 * Opt-in for bank policies (`combine: "all_matching"`): consider every matching
 * rule. Any hard stop / deny → deny. Else any allow_with_obligation → hold.
 * Else allow. All matched rules are returned for the receipt.
 */
export function evaluateRulesWithCombine(
  policyId: string,
  rules: PolicyRuleInput[],
  toolName: string,
  combine: RuleCombineMode = "top_priority",
): PolicyEvaluationExtended {
  const matching = rules.filter((r) => toolMatches(r.tool_pattern, toolName));
  if (matching.length === 0) {
    return {
      decision: "allow",
      policy_id: policyId,
      rule_id: null,
      reason: "no matching rule (default allow)",
      matched_rules: [],
      combine,
    };
  }

  if (combine === "all_matching") {
    const matched: MatchedRule[] = matching.map((r) => ({
      rule_id: r.rule_id,
      policy_id: r.policy_id ?? policyId,
      decision: normalizeDecision(r.decision),
      priority: r.priority,
      hard_stop: Boolean(
        r.conditions &&
          typeof r.conditions === "object" &&
          (r.conditions as { hard_stop?: unknown }).hard_stop === true,
      ),
    }));
    const hard = matched.find((m) => m.hard_stop || m.decision === "deny");
    if (hard) {
      return {
        decision: "deny",
        policy_id: hard.policy_id,
        rule_id: hard.rule_id,
        reason: hard.hard_stop
          ? `hard stop by rule ${hard.rule_id}`
          : `denied by rule ${hard.rule_id}`,
        matched_rules: matched,
        combine,
      };
    }
    const hold = matched.find((m) => m.decision === "allow_with_obligation");
    if (hold) {
      return {
        decision: "allow_with_obligation",
        policy_id: hold.policy_id,
        rule_id: hold.rule_id,
        reason: `human approval required (${matched
          .filter((m) => m.decision === "allow_with_obligation")
          .map((m) => m.rule_id)
          .join(", ")})`,
        matched_rules: matched,
        combine,
      };
    }
    const allow = matched.find((m) => m.decision === "allow");
    return {
      decision: "allow",
      policy_id: allow?.policy_id ?? policyId,
      rule_id: allow?.rule_id ?? null,
      reason: allow
        ? `allowed by rule ${allow.rule_id}`
        : "no allow/deny among matches (default allow)",
      matched_rules: matched,
      combine,
    };
  }

  matching.sort((a, b) => b.priority - a.priority);
  const topPriority = matching[0]!.priority;
  const top = matching.filter((r) => r.priority === topPriority);
  const matchedTop: MatchedRule[] = top.map((r) => ({
    rule_id: r.rule_id,
    policy_id: r.policy_id ?? policyId,
    decision: normalizeDecision(r.decision),
    priority: r.priority,
  }));
  const deny = top.find((r) => r.decision === "deny");
  if (deny) {
    return {
      decision: "deny",
      policy_id: deny.policy_id ?? policyId,
      rule_id: deny.rule_id,
      reason: `denied by rule ${deny.rule_id}`,
      matched_rules: matchedTop,
      combine,
    };
  }
  const obligation = top.find((r) => r.decision === "allow_with_obligation");
  if (obligation) {
    return {
      decision: "allow_with_obligation",
      policy_id: obligation.policy_id ?? policyId,
      rule_id: obligation.rule_id,
      reason: `human approval required (${obligation.rule_id})`,
      matched_rules: matchedTop,
      combine,
    };
  }
  const allow = top.find((r) => r.decision === "allow");
  if (allow) {
    return {
      decision: "allow",
      policy_id: allow.policy_id ?? policyId,
      rule_id: allow.rule_id,
      reason: `allowed by rule ${allow.rule_id}`,
      matched_rules: matchedTop,
      combine,
    };
  }

  return {
    decision: "allow",
    policy_id: policyId,
    rule_id: null,
    reason: "no allow/deny at top priority (default allow)",
    matched_rules: matchedTop,
    combine,
  };
}

function normalizeDecision(decision: string): PolicyDecisionResult {
  if (decision === "deny") return "deny";
  if (decision === "allow_with_obligation") return "allow_with_obligation";
  return "allow";
}
