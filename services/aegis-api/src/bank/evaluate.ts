/**
 * Bank policy evaluation: attribute expressions + optional all_matching combine
 * + authority matrix overlay. Record-only never blocks.
 */

import {
  evaluateRulesWithCombine,
  type PolicyRuleInput,
  type RuleCombineMode,
  type MatchedRule,
} from "../policy/evaluate-rules.js";
import { evalExpr, type Expr } from "./expr.js";
import {
  matchAuthorityMatrix,
  type AuthorityMatrixRow,
  type BankRole,
  type MatrixMatch,
} from "./authority-matrix.js";
import { toBankOutcome, type BankOutcome } from "./outcome.js";

export type BankEvalInput = {
  policy_id: string;
  combine: RuleCombineMode;
  rules: Array<
    PolicyRuleInput & {
      obligations?: unknown;
      /** Attribute expression; when set, rule matches only if expr is true. */
      attr_expr?: Expr | null;
    }
  >;
  tool_name: string;
  attributes: Record<string, unknown>;
  matrix_rows?: AuthorityMatrixRow[];
  ladder?: BankRole[];
  product?: string;
  currency?: string;
  record_only?: boolean;
};

export type BankEvalResult = {
  outcome: BankOutcome;
  would_have?: BankOutcome;
  mode: "enforce" | "record_only";
  decision_internal: string;
  matched_rules: MatchedRule[];
  policy_id: string;
  rule_id: string | null;
  reason: string;
  matrix?: MatrixMatch | null;
  required_roles: string[];
  obligations: unknown[];
};

function ruleMatchesAttributes(
  rule: BankEvalInput["rules"][number],
  attributes: Record<string, unknown>,
): boolean {
  if (!rule.attr_expr) {
    // Also accept conditions.expr for bank rules stored in policy_rule.conditions
    const cond = rule.conditions;
    if (cond && typeof cond === "object" && "expr" in (cond as object)) {
      return evalExpr(attributes, (cond as { expr: Expr }).expr);
    }
    return true;
  }
  return evalExpr(attributes, rule.attr_expr);
}

function mostRestrictive(
  a: BankOutcome,
  b: BankOutcome,
): BankOutcome {
  const rank = (o: BankOutcome) => (o === "stop" ? 3 : o === "hold" ? 2 : 1);
  return rank(a) >= rank(b) ? a : b;
}

export function evaluateBankEvent(input: BankEvalInput): BankEvalResult {
  const applicable = input.rules.filter((r) =>
    ruleMatchesAttributes(r, input.attributes),
  );

  const combined = evaluateRulesWithCombine(
    input.policy_id,
    applicable,
    input.tool_name,
    input.combine,
  );

  const matchedRuleRows = applicable.filter((r) =>
    combined.matched_rules.some((m) => m.rule_id === r.rule_id),
  );
  const obligations = matchedRuleRows
    .map((r) => r.obligations)
    .filter((o) => o != null);

  let outcome = toBankOutcome(combined.decision, obligations[0] ?? undefined);
  let required_roles: string[] = [];

  for (const rule of matchedRuleRows) {
    const obl = rule.obligations;
    if (obl && typeof obl === "object") {
      const o = obl as Record<string, unknown>;
      const role = o.required_role ?? o.role;
      if (typeof role === "string") required_roles.push(role);
      const roles = o.required_roles;
      if (Array.isArray(roles)) {
        for (const rr of roles) {
          if (typeof rr === "string") required_roles.push(rr);
        }
      }
    }
  }

  let matrix: MatrixMatch | null = null;
  const amountRaw =
    input.attributes.amount ??
    input.attributes.amount_rwf ??
    input.attributes.loan_amount;
  const amount =
    typeof amountRaw === "number"
      ? amountRaw
      : typeof amountRaw === "string"
        ? Number(amountRaw)
        : undefined;
  const product =
    input.product ??
    (typeof input.attributes.product === "string"
      ? input.attributes.product
      : undefined);
  const currency =
    input.currency ??
    (typeof input.attributes.currency === "string"
      ? input.attributes.currency
      : undefined);
  // No engine default currency — matrix match requires an explicit currency
  // from the event attributes or caller (tenant/pack configuration).
  const risk_tier =
    typeof input.attributes.risk_tier === "string"
      ? input.attributes.risk_tier
      : null;

  if (
    input.matrix_rows &&
    input.matrix_rows.length > 0 &&
    product &&
    currency &&
    amount !== undefined &&
    Number.isFinite(amount)
  ) {
    matrix = matchAuthorityMatrix(
      input.matrix_rows,
      { product, amount, currency, risk_tier },
      input.ladder ?? [],
    );
    if (matrix) {
      outcome = mostRestrictive(outcome, matrix.outcome);
      if (matrix.required_role) {
        required_roles.push(matrix.required_role);
      }
      // Ensure matrix rule appears in matched list for receipt
      if (
        matrix.row.rule_code &&
        !combined.matched_rules.some((m) => m.rule_id === matrix!.row.rule_code)
      ) {
        combined.matched_rules.push({
          rule_id: matrix.row.rule_code,
          policy_id: input.policy_id,
          decision:
            matrix.outcome === "stop"
              ? "deny"
              : matrix.outcome === "hold"
                ? "allow_with_obligation"
                : "allow",
          priority: 0,
        });
      }
    }
  }

  required_roles = [...new Set(required_roles)];

  const recordOnly = Boolean(input.record_only);
  if (recordOnly && (outcome === "hold" || outcome === "stop")) {
    return {
      outcome: "allow",
      would_have: outcome,
      mode: "record_only",
      decision_internal: combined.decision,
      matched_rules: combined.matched_rules,
      policy_id: combined.policy_id,
      rule_id: combined.rule_id,
      reason: combined.reason,
      matrix,
      required_roles,
      obligations,
    };
  }

  return {
    outcome,
    mode: "enforce",
    decision_internal: combined.decision,
    matched_rules: combined.matched_rules,
    policy_id: combined.policy_id,
    rule_id: combined.rule_id,
    reason: combined.reason,
    matrix,
    required_roles,
    obligations,
  };
}
