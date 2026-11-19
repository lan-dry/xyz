/**
 * Explain why a bank outcome was chosen given matched rules (receipt decision_basis).
 */

import type { MatchedRule } from "../policy/evaluate-rules.js";
import type { BankOutcome } from "./outcome.js";
import { isHumanApprovalObligation, toBankOutcome } from "./outcome.js";

export type DecisionBasisRule = {
  rule_id: string;
  policy_id: string;
  decision: string;
  /** Bank-boundary effect of this rule alone. */
  effect: BankOutcome | "obligation_recorded";
  note?: string;
};

export type DecisionBasis = {
  outcome: BankOutcome;
  decided_by_rule_id: string | null;
  explanation: string;
  matched: DecisionBasisRule[];
};

function effectForRule(
  decision: string,
  obligations: unknown | undefined,
): { effect: DecisionBasisRule["effect"]; note?: string } {
  if (decision === "deny") return { effect: "stop" };
  if (decision === "allow_with_obligation") {
    if (isHumanApprovalObligation(obligations)) {
      return { effect: "hold", note: "requires human approval" };
    }
    return {
      effect: "obligation_recorded",
      note: "non-human obligation recorded; does not hold (D2)",
    };
  }
  return { effect: "allow" };
}

/**
 * Build a plain decision_basis for receipts and UI.
 * When a matched rule says allow_with_obligation but the outcome is allow,
 * state why (D2 / non-human obligation, or a more restrictive rule did not apply).
 */
export function buildDecisionBasis(input: {
  outcome: BankOutcome;
  matched_rules: MatchedRule[];
  rule_obligations?: Record<string, unknown>;
  decided_rule_id?: string | null;
  reason?: string;
  matrix_rule_id?: string | null;
  /** Business plain English (e.g. velocity / fraud) preferred for hold/stop. */
  plain_explanation?: string | null;
}): DecisionBasis {
  const matched: DecisionBasisRule[] = input.matched_rules.map((m) => {
    const obl = input.rule_obligations?.[m.rule_id];
    const { effect, note } = effectForRule(m.decision, obl);
    return {
      rule_id: m.rule_id,
      policy_id: m.policy_id,
      decision: m.decision,
      effect,
      note,
    };
  });

  const holdRules = matched.filter((m) => m.effect === "hold");
  const recordedOnly = matched.filter((m) => m.effect === "obligation_recorded");
  const allowRules = matched.filter((m) => m.effect === "allow");
  const stopRules = matched.filter((m) => m.effect === "stop");

  // Prefer the rule that actually drove the outcome (hold/stop before matrix allow).
  const decided =
    (input.outcome === "hold"
      ? holdRules[0]?.rule_id
      : input.outcome === "stop"
        ? stopRules[0]?.rule_id
        : allowRules[0]?.rule_id) ??
    input.decided_rule_id ??
    input.matrix_rule_id ??
    matched.find((m) => m.effect === input.outcome)?.rule_id ??
    matched[0]?.rule_id ??
    null;

  let explanation: string;
  const plain =
    typeof input.plain_explanation === "string" &&
    input.plain_explanation.trim()
      ? input.plain_explanation.trim()
      : null;
  if (input.outcome === "stop") {
    const stop = matched.find((m) => m.effect === "stop");
    explanation =
      plain ??
      (stop
        ? `Stopped by rule ${stop.rule_id}.`
        : input.reason ?? "Stopped by policy.");
  } else if (input.outcome === "hold") {
    const hold = holdRules[0];
    explanation =
      plain ??
      (hold
        ? `Held because rule ${hold.rule_id} requires human approval${
            allowRules.length
              ? `; ${allowRules.map((a) => a.rule_id).join(", ")} alone would allow`
              : ""
          }.`
        : input.reason ?? "Held for human approval.");
  } else {
    // allow
    if (recordedOnly.length > 0 && holdRules.length === 0) {
      explanation =
        `Allowed. Matched rule(s) ${recordedOnly.map((r) => r.rule_id).join(", ")} ` +
        `carry allow_with_obligation but the obligation is not human approval, ` +
        `so per policy they do not become a hold (D2). ` +
        (allowRules.length
          ? `Allowing rule(s): ${allowRules.map((a) => a.rule_id).join(", ")}.`
          : "");
    } else if (holdRules.length > 0) {
      // Should not normally happen — defensive wording
      explanation =
        `Allowed despite hold-capable rule(s) ${holdRules.map((h) => h.rule_id).join(", ")}. ` +
        (input.reason ?? "See technical details.");
    } else {
      const primary = decided ?? allowRules[0]?.rule_id ?? "policy";
      explanation = `Allowed under rule ${primary}. No human approval was needed.`;
    }
  }

  return {
    outcome: input.outcome,
    decided_by_rule_id: decided,
    explanation: explanation.trim(),
    matched,
  };
}

/** Recompute bank outcome from a single matched rule's decision + obligations. */
export function ruleBoundaryOutcome(
  decision: string,
  obligations?: unknown,
): BankOutcome {
  return toBankOutcome(decision, obligations);
}
