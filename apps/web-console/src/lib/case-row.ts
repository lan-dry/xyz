/**
 * Plain-language facts for list rows (Live feed, approvals) from
 * GET /cases/summary. Uses the same wording as the case page via describeDecision.
 */

import {
  actionLabel,
  decidedByLine,
  dedupeRuleLabels,
  describeDecision,
  formatApprover,
  formatRoleLabel,
} from "./describe-decision";
import { formatMoney } from "./format-display";
import type { CaseApprover, CaseSealStatus, CaseSummary } from "./types";
import type { OutcomeKind } from "./outcome-vocab";

export type RowChip = { chip: string; kind: OutcomeKind };

const DECLINE_DECISIONS = new Set(["rejected", "declined", "denied"]);

/** "Jean Mutabazi · Credit Manager". Never the email (that lives in Technical details). */
export function approverDisplay(a: CaseApprover): string {
  const who =
    formatApprover(a.name, a.role) ??
    formatRoleLabel(a.role) ??
    "An authorised approver";
  const actingFor = a.delegated_from_name?.trim() || a.delegated_from_email?.trim();
  return actingFor ? `${who}, acting for ${actingFor}` : who;
}

/** The decisive vote: a decline wins, else the latest approval or fraud release. */
function decisiveApprover(s: CaseSummary): CaseApprover | null {
  const declined = s.approvers.find((a) => DECLINE_DECISIONS.has(a.decision));
  if (declined) return declined;
  const approved = s.approvers.filter(
    (a) => a.decision === "approved" || a.decision === "released",
  );
  return approved[approved.length - 1] ?? null;
}

/** True for the low-band / default-allow authority id (AUTH-RL-1 or legacy AUTH-RL). */
function isDefaultAllowRuleId(ruleId: string): boolean {
  return /(^|_)AUTH-RL(-1)?$/.test(ruleId);
}

/** Rule that drove the outcome. A hold names the hold rule, never the default allow. */
export function decidingRuleId(s: CaseSummary): string | null {
  if (s.decided_by_rule_id) return s.decided_by_rule_id;
  if (s.outcome === "hold" || s.outcome === "stop") {
    const nonAllow = s.rules.find((r) => !isDefaultAllowRuleId(r));
    if (nonAllow) return nonAllow;
  }
  return s.rules[0] ?? null;
}

/**
 * Labels for rules that drove the outcome only. A default allow overridden by a
 * hold/stop is omitted; titles resolve by rule id.
 */
export function ruleLabels(s: CaseSummary | undefined): string[] {
  if (!s) return [];
  const first = decidingRuleId(s);
  const ids =
    s.outcome === "hold" || s.outcome === "stop"
      ? (first ? [first, ...s.rules.filter((r) => r !== first && !isDefaultAllowRuleId(r))] : s.rules.filter((r) => !isDefaultAllowRuleId(r)))
      : first
        ? [first, ...s.rules.filter((r) => r !== first)]
        : s.rules;
  return dedupeRuleLabels(ids, s.outcome);
}

/**
 * Bank vocabulary for a generic trace chip (used when the case has no bank summary):
 * Completed → Allowed, Failed → Stopped, Ask a person → Needs approval.
 */
export function bankVocabChip(chip: string, kind: OutcomeKind): RowChip {
  switch (chip.trim().toLowerCase()) {
    case "completed":
      return { chip: "Allowed", kind: "allow" };
    case "failed":
      return { chip: "Stopped", kind: "stop" };
    case "ask a person":
      return { chip: "Needs approval", kind: "ask_person" };
    case "running":
      return { chip: "In progress", kind };
    default:
      return { chip, kind };
  }
}

/** Outcome chip: held cases show their approval state, not just "Held". */
export function chipFromSummary(s: CaseSummary | undefined): RowChip | null {
  if (!s?.outcome) return null;
  if (s.mode === "record_only") return { chip: "Recorded only", kind: "neutral" };
  if (s.outcome === "allow") return { chip: "Allowed", kind: "allow" };
  if (s.outcome === "stop") return { chip: "Stopped", kind: "stop" };
  if (s.outcome === "hold") {
    const status = (s.approval_status ?? "pending").toLowerCase();
    if (status === "approved" || status === "released") {
      return { chip: "Approved", kind: "approved" };
    }
    if (status === "rejected" || status === "declined" || status === "denied") {
      return { chip: "Declined", kind: "declined" };
    }
    if (status === "expired") return { chip: "Expired", kind: "expired" };
    return { chip: "Needs approval", kind: "ask_person" };
  }
  return { chip: s.outcome, kind: "neutral" };
}

/** "Decided by …" or "Record only — no decision". Null until the case summary loads. */
export function decidedByFromSummary(s: CaseSummary | undefined): string | null {
  if (!s?.outcome && s?.mode !== "record_only") return null;
  if (!s) return null;
  const decisive =
    s.outcome === "hold" || s.outcome === "stop" ? decisiveApprover(s) : null;
  const declined = decisive ? DECLINE_DECISIONS.has(decisive.decision) : false;
  const ruleId = decidingRuleId(s);
  const human = Boolean(decisive);
  return decidedByLine({
    mode: s.mode,
    outcome: !decisive
      ? (s.outcome ?? "allow")
      : declined
        ? "declined"
        : "released",
    decided_by_rule_id: ruleId,
    approver_name: decisive?.name?.trim() || (decisive ? formatRoleLabel(decisive.role) : null),
    approver_role: decisive?.name ? decisive.role : null,
    fraud_block_override:
      human && !declined && Boolean(ruleId && /(^|_)FRD-/.test(ruleId)),
  });
}

/** One plain sentence: what this case was and what happened. */
export function whatFromSummary(s: CaseSummary | undefined): string | null {
  if (!s?.outcome) return null;
  const decisive =
    s.outcome === "hold" || s.outcome === "stop" ? decisiveApprover(s) : null;
  const declined = decisive ? DECLINE_DECISIONS.has(decisive.decision) : false;
  const outcome =
    decisive && (s.outcome === "hold" || s.outcome === "stop")
      ? declined
        ? "declined"
        : "released"
      : s.outcome;
  const ruleId = decidingRuleId(s);
  return describeDecision({
    outcome,
    fraud_block_override:
      Boolean(decisive) &&
      !declined &&
      Boolean(ruleId && /(^|_)FRD-/.test(ruleId)),
    product: s.product,
    event_type: s.event_type,
    amount: s.amount,
    currency: s.currency ?? null,
    matched_rules: s.rules.map((rule_id) => ({ rule_id })),
    decided_by_rule_id: decidingRuleId(s),
    required_role: s.required_role,
    approver_name: decisive?.name ?? (decisive ? approverDisplay(decisive) : null),
    approver_role: decisive?.name ? decisive.role : null,
    approved_at: decisive?.decided_at ?? null,
    approval_reason: decisive?.reason ?? null,
    mode: s.mode,
  });
}

export function approversLabel(s: CaseSummary | undefined): string {
  if (!s?.outcome) return "-";
  if (s.approvers.length > 0) {
    const parts = s.approvers.map((a) =>
      DECLINE_DECISIONS.has(a.decision)
        ? `${approverDisplay(a)} (declined)`
        : approverDisplay(a),
    );
    return [...new Set(parts)].join(", ");
  }
  if (s.outcome === "allow") return "Approver: not needed";
  if (s.outcome === "stop") return "None";
  if (s.outcome === "hold") {
    return s.required_role
      ? `Waiting for ${formatRoleLabel(s.required_role)}`
      : "Waiting for an approver";
  }
  return "-";
}

export type SealDisplay = { label: string; tone: "ok" | "warn" | "bad" | "muted" };

export function sealDisplay(seal: CaseSealStatus | undefined): SealDisplay {
  switch (seal) {
    case "sealed":
      return { label: "Sealed", tone: "ok" };
    case "sealed_pending_witness":
      return { label: "Sealed, witness pending", tone: "warn" };
    case "provisional":
      return { label: "Not yet sealed", tone: "warn" };
    case "broken":
      return { label: "Seal broken", tone: "bad" };
    default:
      return { label: "-", tone: "muted" };
  }
}

export function roleLabel(role: string | null | undefined): string {
  return role ? (formatRoleLabel(role) ?? role) : "an authorised approver";
}

/**
 * Short card title from describeDecision (amount uses event currency when present).
 * Null when the case has no facts yet.
 */
export function titleFromSummary(s: CaseSummary | undefined): string | null {
  if (!s?.outcome) return null;
  const what = actionLabel(s.product, s.event_type);
  const money = formatMoney(s.amount, s.currency);
  return money ? `${what} of ${money}` : what;
}

/** Filter / table value for what the case was: same vocabulary as the title. */
export function productFromSummary(s: CaseSummary | undefined): string | null {
  if (!s) return null;
  if (!s.product && !s.event_type) return null;
  return actionLabel(s.product, s.event_type);
}
