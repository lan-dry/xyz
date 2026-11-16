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
import {
  isHumanApprovalObligation,
  toBankOutcome,
  type BankOutcome,
} from "./outcome.js";
import {
  buildDecisionBasis,
  type DecisionBasis,
} from "./decision-basis.js";

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
  decision_basis: DecisionBasis;
};

function readAmount(attributes: Record<string, unknown>): number | undefined {
  const amountRaw =
    attributes.amount ?? attributes.amount_rwf ?? attributes.loan_amount;
  if (typeof amountRaw === "number" && Number.isFinite(amountRaw)) return amountRaw;
  if (typeof amountRaw === "string") {
    const n = Number(amountRaw);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Match bank rule attribute / amount conditions (incl. amount_gte used by demo v4). */
function ruleMatchesAttributes(
  rule: BankEvalInput["rules"][number],
  attributes: Record<string, unknown>,
): boolean {
  const cond =
    rule.conditions && typeof rule.conditions === "object"
      ? (rule.conditions as Record<string, unknown>)
      : null;

  if (rule.attr_expr) {
    if (!evalExpr(attributes, rule.attr_expr)) return false;
  } else if (cond && "expr" in cond) {
    if (!evalExpr(attributes, cond.expr as Expr)) return false;
  }

  if (cond) {
    const amount = readAmount(attributes);
    const checks: Array<[string, (a: number, t: number) => boolean]> = [
      ["amount_gte", (a, t) => a >= t],
      ["amount_gt", (a, t) => a > t],
      ["amount_lte", (a, t) => a <= t],
      ["amount_lt", (a, t) => a < t],
      ["amount_eq", (a, t) => a === t],
    ];
    for (const [key, cmp] of checks) {
      if (key in cond) {
        const threshold = Number(cond[key]);
        if (!Number.isFinite(threshold)) return false;
        if (amount === undefined || !cmp(amount, threshold)) return false;
      }
    }
  }

  return true;
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
  const ruleObligations: Record<string, unknown> = {};
  for (const rule of matchedRuleRows) {
    if (rule.obligations != null) {
      ruleObligations[rule.rule_id] = rule.obligations;
    } else if (
      rule.conditions &&
      typeof rule.conditions === "object" &&
      (rule.conditions as { obligations?: unknown }).obligations != null
    ) {
      ruleObligations[rule.rule_id] = (
        rule.conditions as { obligations: unknown }
      ).obligations;
    }
  }
  const obligations = Object.values(ruleObligations);

  // Prefer human-approval obligations when mapping the combined decision (D2).
  const humanObl =
    obligations.find((o) => isHumanApprovalObligation(o)) ?? obligations[0];
  let outcome = toBankOutcome(combined.decision, humanObl);
  let required_roles: string[] = [];

  for (const rule of matchedRuleRows) {
    const obl = ruleObligations[rule.rule_id] ?? rule.obligations;
    if (obl && typeof obl === "object") {
      const o = obl as Record<string, unknown>;
      const role = o.required_role ?? o.role;
      if (typeof role === "string") required_roles.push(role);
      const roles = o.required_roles ?? o.roles;
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
  const finalOutcome =
    recordOnly && (outcome === "hold" || outcome === "stop") ? "allow" : outcome;
  const would_have =
    recordOnly && (outcome === "hold" || outcome === "stop") ? outcome : undefined;

  // Include matrix-synthesised rules in obligation map as empty
  for (const m of combined.matched_rules) {
    if (!(m.rule_id in ruleObligations) && m.decision === "allow_with_obligation") {
      // Matrix hold rows imply human approval
      ruleObligations[m.rule_id] = { kind: "human_approval" };
    }
  }

  const decision_basis = buildDecisionBasis({
    outcome: finalOutcome,
    matched_rules: combined.matched_rules,
    rule_obligations: ruleObligations,
    decided_rule_id: combined.rule_id,
    reason: combined.reason,
    matrix_rule_id: matrix?.row.rule_code ?? null,
  });

  if (recordOnly && would_have) {
    return {
      outcome: "allow",
      would_have,
      mode: "record_only",
      decision_internal: combined.decision,
      matched_rules: combined.matched_rules,
      policy_id: combined.policy_id,
      rule_id: combined.rule_id,
      reason: combined.reason,
      matrix,
      required_roles,
      obligations,
      decision_basis,
    };
  }

  return {
    outcome: finalOutcome,
    mode: "enforce",
    decision_internal: combined.decision,
    matched_rules: combined.matched_rules,
    policy_id: combined.policy_id,
    rule_id: combined.rule_id,
    reason: combined.reason,
    matrix,
    required_roles,
    obligations,
    decision_basis,
  };
}
