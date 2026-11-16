/**
 * Single source of truth for plain-language decision wording (screens, PDF, CSV).
 */

import type { DecisionBasis } from "./decision-basis.js";
import type { BankOutcome } from "./outcome.js";

/** Sector-neutral event labels. Banking-specific loan titles live in pack.labels. */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  payment_transfer: "Payment release",
  payment_release: "Payment release",
  data_access: "Customer data access",
  kyc_refresh: "Customer data access",
  policy_publish: "Policy publish",
  generic: "Governed action",
  governed_action: "Governed action",
  // Demo banking pack event types (illustrative — prefer pack.labels.event_type_labels).
  loan_decision: "Loan disbursement",
  loan_disbursement: "Loan disbursement",
};

/**
 * Demo-pack rule titles only (banking seed). Prefer `pack.labels.rule_titles`.
 * Not engine defaults — missing codes fall through to the raw rule id.
 */
export const RULE_TITLES: Record<string, string> = {
  "AUTH-RL": "Within officer limit",
  "AUTH-RL-HIGH": "Above manager band",
  "LN-07": "High model score requires Credit Manager",
  "PAY-03": "Payment callback verification",
  "SANC-01": "Sanctions / PEP hard stop",
  "CLM-01": "Within claims handler limit",
  "CLM-02": "Requires claims supervisor",
  "CLM-03": "Requires chief claims officer",
  "CLM-STAFF": "Staff or related claimant requires fraud review",
};

/**
 * Demo-pack role titles (banking + insurance seeds). Prefer pack.labels.role_labels
 * or humanise the key. Not a closed set of institution roles.
 */
export const BANK_ROLE_LABELS: Record<string, string> = {
  credit_officer: "Credit Officer",
  credit_manager: "Credit Manager",
  compliance_officer: "Compliance Officer",
  head_of_compliance: "Head of Compliance",
  dpo: "DPO",
  admin: "Administrator",
  claims_handler: "Claims Handler",
  claims_supervisor: "Claims Supervisor",
  fraud_analyst: "Fraud Analyst",
  chief_claims: "Chief Claims Officer",
};

/** `credit_manager` → "Credit Manager". */
export function formatRoleLabel(role: string | null | undefined): string | null {
  if (!role) return null;
  const known = BANK_ROLE_LABELS[role];
  if (known) return known;
  return role
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** "Jean Mutabazi · Credit Manager" (name first; role when known). */
export function formatApprover(
  name: string | null | undefined,
  role: string | null | undefined,
): string | null {
  const n = name?.trim();
  if (!n) return null;
  const r = formatRoleLabel(role);
  return r && r.toLowerCase() !== n.toLowerCase() ? `${n} · ${r}` : n;
}

export const OUTCOME_LABELS: Record<BankOutcome | string, string> = {
  allow: "Allowed",
  hold: "Held",
  stop: "Stopped",
  released: "Released",
  approved: "Approved",
  declined: "Declined",
};

export const RULE_EFFECT_LABELS: Record<string, string> = {
  allow: "allows automatically",
  hold: "requires human approval",
  stop: "stops the action",
  deny: "stops the action",
  allow_with_obligation: "requires an obligation",
  obligation_recorded: "records a non-blocking obligation",
};

export type DescribeDecisionInput = {
  outcome: BankOutcome | string;
  product?: string | null;
  event_type?: string | null;
  amount?: number | null;
  currency?: string | null;
  policy_version?: number | string | null;
  policy_label?: string | null;
  matched_rules?: Array<{ rule_id: string; decision?: string }>;
  decided_by_rule_id?: string | null;
  decision_basis?: DecisionBasis | null;
  required_role?: string | null;
  required_role_label?: string | null;
  approver_name?: string | null;
  approver_role?: string | null;
  approved_at?: string | null;
  approval_reason?: string | null;
  would_have?: BankOutcome | string | null;
  mode?: "enforce" | "record_only" | string | null;
};

function formatAmount(amount: number | null | undefined, currency?: string | null): string | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  const formatted = Math.round(amount).toLocaleString("en-GB");
  const cur = currency?.trim() ? currency.trim().toUpperCase() : "";
  // No default currency — missing currency means show the number alone.
  return cur ? `${cur} ${formatted}` : formatted;
}

/** Plain product name for selects and tables (never the raw key). */
export function productDisplayLabel(product: string): string {
  return productLabel(product, null);
}

function productLabel(product?: string | null, eventType?: string | null): string {
  // Prefer event_type so KYC / payment are not mislabelled as loans.
  if (eventType && EVENT_TYPE_LABELS[eventType]) {
    return EVENT_TYPE_LABELS[eventType]!;
  }
  if (product === "retail_loan") return "Loan disbursement"; // demo banking pack product
  if (product === "claim_payout") return "Claim payout"; // illustrative insurance pack
  if (product === "customer_data") return "Customer data access";
  if (product === "payment" || product === "payments") return "Payment release";
  if (product) return product.replace(/_/g, " ");
  return "Action";
}

/** "Loan disbursement" / "Payment release" / "Customer data access" (event_type first). */
export const actionLabel = productLabel;

/** Display "AUTH-RL · Within officer limit"; strip UUID-like policy ids. */
export function formatRuleLabel(
  ruleId: string | null | undefined,
  /** Effect of the rule on this case. AUTH-RL on a hold/stop is "Above officer limit". */
  effect?: "allow" | "hold" | "stop" | string | null,
): string | null {
  if (!ruleId) return null;
  if (/^[0-9a-f-]{36}$/i.test(ruleId)) return null;
  let code = ruleId;
  if (/^pol_/i.test(ruleId)) {
    // Pack rules are stored as `pol_pack_<pack>_<hash>_<CODE>`; show only the code.
    const m = /_([A-Z]{2,8}(?:-[A-Z0-9]+)+)$/.exec(ruleId);
    if (!m) return null;
    code = m[1]!;
  }
  if (code === "AUTH-RL" && (effect === "hold" || effect === "stop")) {
    return `${code} · Above officer limit`;
  }
  // Collapse r_v4_… demo ids to a short code when no title
  const title = RULE_TITLES[code];
  if (title) return `${code} · ${title}`;
  if (/^r_v4_/i.test(code)) return `${code} · Dual-publish hold rule`;
  return code;
}

export function dedupeRuleLabels(
  ids: Array<string | null | undefined>,
  effect?: string | null,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const label = formatRuleLabel(id, effect);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

function policyPhrase(input: DescribeDecisionInput): string {
  if (input.policy_label) return `Policy ${input.policy_label}.`;
  if (input.policy_version != null && input.policy_version !== "") {
    return `Policy v${input.policy_version}.`;
  }
  return "";
}

/**
 * Plain-language sentence for a receipt / case / export row.
 * Never emits governed.action or policy_decision.
 */
export function describeDecision(receipt: DescribeDecisionInput): string {
  const what = productLabel(receipt.product, receipt.event_type);
  const money = formatAmount(receipt.amount ?? null, receipt.currency);
  const subject = money ? `${what} of ${money}` : what;
  const ruleId =
    receipt.decision_basis?.decided_by_rule_id ??
    receipt.decided_by_rule_id ??
    receipt.matched_rules?.find((m) => m.decision === "allow_with_obligation" || m.decision === "deny")
      ?.rule_id ??
    receipt.matched_rules?.[0]?.rule_id ??
    null;
  const ruleEffect =
    receipt.outcome === "allow"
      ? "allow"
      : receipt.outcome === "stop"
        ? "stop"
        : "hold";
  const rule = formatRuleLabel(ruleId, ruleEffect);
  const pol = policyPhrase(receipt);
  const who = formatApprover(receipt.approver_name, receipt.approver_role);
  const when = receipt.approved_at ? ` on ${formatUtc(receipt.approved_at)}` : "";
  const reason = receipt.approval_reason
    ? `, reason: ${receipt.approval_reason}`
    : "";

  if (receipt.mode === "record_only" && receipt.would_have) {
    const would = OUTCOME_LABELS[receipt.would_have] ?? String(receipt.would_have);
    return (
      `${subject} was recorded only (not blocked). ` +
      `Under enforce mode this would have been ${would.toLowerCase()}` +
      (rule ? ` under rule ${rule}` : "") +
      `. ${pol}`
    ).trim();
  }

  if (receipt.outcome === "declined" || receipt.outcome === "rejected") {
    // Hold rule (decision_basis.decided_by_rule_id), then who declined and why.
    const heldRole =
      receipt.required_role_label ??
      (receipt.required_role ? formatRoleLabel(receipt.required_role) : null);
    const held = rule
      ? ` It was held because rule ${rule} requires ${heldRole ? `a ${heldRole}` : "human approval"}.`
      : "";
    return (
      `${subject} was declined by ${who ?? "an authorised approver"}${when}${reason}.${held} ${pol}`
    ).trim();
  }

  if (receipt.outcome === "allow") {
    const basis = receipt.decision_basis?.explanation;
    if (basis && /non-human obligation|do not become a hold/i.test(basis)) {
      return `${subject} was allowed. ${basis} ${pol}`.trim();
    }
    return (
      `${subject} was allowed automatically` +
      (rule ? ` under rule ${rule}` : "") +
      `. No human approval was needed. ${pol}`
    ).trim();
  }

  if (receipt.outcome === "hold") {
    const role =
      receipt.required_role_label ??
      formatRoleLabel(receipt.required_role) ??
      "authorised approver";
    return (
      `${subject} was held because` +
      (rule ? ` rule ${rule} requires` : " policy requires") +
      ` ${/^[aeiou]/i.test(role) ? "an" : "a"} ${role}. ${pol}`
    ).trim();
  }

  if (receipt.outcome === "stop") {
    return (
      `${subject} was stopped` +
      (rule ? ` by rule ${rule}` : " by policy") +
      `. ${pol}`
    ).trim();
  }

  if (receipt.outcome === "released" || receipt.outcome === "approved") {
    return (
      `${subject} was held` +
      (rule
        ? ` because rule ${rule} requires a ${
            receipt.required_role_label ??
            formatRoleLabel(receipt.required_role) ??
            "authorised approver"
          }`
        : "") +
      `. Approved by ${who ?? "an authorised approver"}${when}${
        receipt.approval_reason ? ` with the reason: ${receipt.approval_reason}` : ""
      }. ${pol}`
    ).trim();
  }

  return (
    receipt.decision_basis?.explanation ??
    `${subject}: ${OUTCOME_LABELS[receipt.outcome] ?? receipt.outcome}. ${pol}`
  ).trim();
}

// Note: never fall back to a sector-specific role title (e.g. "Credit Manager").
// Call sites pass required_role_label from the tenant ladder / pack when available.

function formatUtc(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const day = d.getUTCDate();
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const mon = months[d.getUTCMonth()]!;
    const y = d.getUTCFullYear();
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    return `${day} ${mon} ${y} at ${hh}:${mm} UTC`;
  } catch {
    return iso;
  }
}
