/**
 * Read-only views over the bank rule engine for the console "Rules" page:
 *   - authority matrix with plain labels (role ladder display names)
 *   - evaluate-preview: what would the engine decide for product + amount + risk
 *
 * Pure functions (no DB). The route loads rows and calls these. Preview uses the
 * same evaluateBankEvent the live intake uses; nothing is written or sealed.
 */

import type { RuleCombineMode } from "../policy/evaluate-rules.js";
import type { AuthorityMatrixRow, BankRole } from "./authority-matrix.js";
import { formatRuleLabel, productDisplayLabel } from "./describe-decision.js";
import { evaluateBankEvent, type BankEvalInput } from "./evaluate.js";
import type { BankOutcome } from "./outcome.js";

/** `pol_pack_demo_banking_3b9f_LN-07` -> `LN-07`; plain codes pass through. */
export function ruleCode(ruleId: string | null | undefined): string | null {
  if (!ruleId) return null;
  const tail = ruleId.split("_").pop() ?? ruleId;
  if (/^[A-Z]{1,6}(-[A-Z0-9]+)+$/.test(tail)) return tail;
  return ruleId;
}

/**
 * `AUTH-RL · Within officer limit` (never a raw policy id). When AUTH-RL holds or
 * stops a case it is above the officer limit, so the title says that instead.
 */
export function ruleDisplayLabel(
  ruleId: string | null | undefined,
  effect?: string | null,
): string | null {
  const code = ruleCode(ruleId);
  if (!code) return null;
  if (code === "AUTH-RL" && (effect === "hold" || effect === "stop")) {
    return `${code} · Above officer limit`;
  }
  return formatRuleLabel(code) ?? code;
}

export function roleDisplayName(
  ladder: BankRole[],
  roleKey: string | null | undefined,
): string | null {
  if (!roleKey) return null;
  return (
    ladder.find((r) => r.role_key === roleKey)?.display_name ??
    roleKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function groupDigits(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function amountBandLabel(
  min: number,
  max: number | null,
  currency: string,
): string {
  if (max == null) return `${currency} ${groupDigits(min)} and above`;
  if (min <= 0) return `Under ${currency} ${groupDigits(max)}`;
  return `${currency} ${groupDigits(min)} to under ${currency} ${groupDigits(max)}`;
}

export type AuthorityMatrixView = {
  matrix_id: string;
  product: string;
  product_label: string;
  amount_min: number;
  amount_max: number | null;
  currency: string;
  amount_band: string;
  risk_tier: string | null;
  risk_label: string;
  outcome: "allow" | "hold" | "stop";
  required_role: string | null;
  required_role_label: string | null;
  /** Human sentence: "Credit Manager or above", "No approval needed", "Stopped". */
  required_text: string;
  or_above: boolean;
  rule_code: string | null;
  rule_label: string | null;
};

export function riskLabel(tier: string | null): string {
  if (!tier) return "Any";
  return tier.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function requiredText(
  outcome: "allow" | "hold" | "stop",
  roleLabel: string | null,
): string {
  if (outcome === "allow") return "No approval needed";
  if (outcome === "stop") return "Stopped. No approver can release it";
  return roleLabel ? `${roleLabel} or above` : "An authorised approver";
}

export function buildAuthorityMatrixView(
  rows: AuthorityMatrixRow[],
  ladder: BankRole[],
): AuthorityMatrixView[] {
  return [...rows]
    .sort(
      (a, b) =>
        a.product.localeCompare(b.product) ||
        a.currency.localeCompare(b.currency) ||
        a.amount_min - b.amount_min ||
        (a.risk_tier ?? "").localeCompare(b.risk_tier ?? ""),
    )
    .map((r) => {
      const roleLabel = roleDisplayName(ladder, r.required_role);
      return {
        matrix_id: r.matrix_id,
        product: r.product,
        product_label: productDisplayLabel(r.product),
        amount_min: r.amount_min,
        amount_max: r.amount_max,
        currency: r.currency,
        amount_band: amountBandLabel(r.amount_min, r.amount_max, r.currency),
        risk_tier: r.risk_tier,
        risk_label: riskLabel(r.risk_tier),
        outcome: r.outcome,
        required_role: r.required_role,
        required_role_label: roleLabel,
        required_text: requiredText(r.outcome, roleLabel),
        or_above: r.outcome === "hold" && Boolean(r.required_role),
        rule_code: r.rule_code,
        rule_label: ruleDisplayLabel(r.rule_code, r.outcome),
      };
    });
}

export type RulePreviewInput = {
  product: string;
  amount: number;
  currency: string;
  risk_tier?: string | null;
  /** Optional credit model score for attribute rules (e.g. model.score > 0.7). */
  model_score?: number | null;
  policy_id: string;
  policy_version: number;
  combine: RuleCombineMode;
  rules: BankEvalInput["rules"];
  matrix_rows: AuthorityMatrixRow[];
  ladder: BankRole[];
};

export type RulePreviewResult = {
  outcome: BankOutcome;
  outcome_label: string;
  deciding_rule: { code: string | null; label: string | null; source: "authority_matrix" | "policy_rule" | "none" };
  required_role: string | null;
  required_role_label: string | null;
  required_text: string;
  matched_rules: Array<{ code: string | null; label: string | null; effect: string }>;
  explanation: string;
  policy_label: string;
  matrix_row: AuthorityMatrixView | null;
  preview_only: true;
};

const OUTCOME_TEXT: Record<BankOutcome, string> = {
  allow: "Allowed",
  hold: "Held for approval",
  stop: "Stopped",
};

export function previewBankRules(input: RulePreviewInput): RulePreviewResult {
  const attributes: Record<string, unknown> = {
    amount: input.amount,
    currency: input.currency,
    product: input.product,
  };
  if (input.risk_tier) attributes.risk_tier = input.risk_tier;
  if (typeof input.model_score === "number" && Number.isFinite(input.model_score)) {
    attributes.model = { score: input.model_score };
  }

  const result = evaluateBankEvent({
    policy_id: input.policy_id,
    combine: input.combine,
    rules: input.rules,
    tool_name: "governed.action",
    attributes,
    matrix_rows: input.matrix_rows,
    ladder: input.ladder,
    product: input.product,
    currency: input.currency,
    record_only: false,
  });

  const decidedId =
    result.decision_basis.decided_by_rule_id ?? result.matrix?.row.rule_code ?? null;
  const decidedCode = ruleCode(decidedId);
  const matrixCode = result.matrix?.row.rule_code ?? null;
  const source: RulePreviewResult["deciding_rule"]["source"] = !decidedCode
    ? "none"
    : matrixCode && ruleCode(matrixCode) === decidedCode
      ? "authority_matrix"
      : "policy_rule";

  const roleKey = result.required_roles[0] ?? null;
  const roleLabel = roleDisplayName(input.ladder, roleKey);
  const matrixView = result.matrix
    ? buildAuthorityMatrixView([result.matrix.row], input.ladder)[0] ?? null
    : null;

  return {
    outcome: result.outcome,
    outcome_label: OUTCOME_TEXT[result.outcome],
    deciding_rule: {
      code: decidedCode,
      label: ruleDisplayLabel(decidedId, result.outcome),
      source,
    },
    required_role: roleKey,
    required_role_label: roleLabel,
    required_text: requiredText(result.outcome, roleLabel),
    matched_rules: result.decision_basis.matched.map((m) => ({
      code: ruleCode(m.rule_id),
      label: ruleDisplayLabel(m.rule_id, m.effect),
      effect: m.effect,
    })),
    explanation: previewSentence(
      result.outcome,
      input,
      roleLabel,
      decidedCode,
    ),
    policy_label: `v${input.policy_version}`,
    matrix_row: matrixView,
    preview_only: true,
  };
}

function previewSentence(
  outcome: BankOutcome,
  input: RulePreviewInput,
  roleLabel: string | null,
  decidedCode: string | null,
): string {
  const what = `${productDisplayLabel(input.product)} of ${input.currency} ${groupDigits(input.amount)}`;
  const rule = ruleDisplayLabel(decidedCode, outcome);
  const under = rule ? ` under ${rule}` : "";
  if (outcome === "allow") {
    return `${what} would be allowed automatically${under}. No human approval is needed.`;
  }
  if (outcome === "stop") {
    return `${what} would be stopped${under}.`;
  }
  const approver = roleLabel
    ? `A ${roleLabel} or above`
    : "An authorised approver";
  return `${what} would be held${under}. ${approver} must approve it.`;
}
