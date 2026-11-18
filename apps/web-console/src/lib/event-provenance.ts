import {
  describeDecision,
  formatApprover,
  formatRuleLabel,
  OUTCOME_LABELS,
} from "./describe-decision";
import { formatRwf } from "./format-display";
import { actionKindPlain, outcomeFromPolicyDecision } from "./outcome-vocab";

export type EventProvenance = {
  summary: string;
  lines: Array<{ label: string; value: string }>;
};

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) {
    return v.trim();
  }
  return null;
}

/** investor_summary text like "Governed decision allow for case X" is internal wording. */
export function userFacingSummary(v: unknown): string | null {
  const s = str(v);
  if (!s || /^governed decision\b/i.test(s)) return null;
  if (/governed\.action|policy_decision/i.test(s)) return null;
  return s;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function decidedRuleId(payload: Record<string, unknown>, rules: string[]): string | null {
  return (
    str(payload.decided_by_rule_id) ??
    (payload.decision_basis &&
    typeof payload.decision_basis === "object" &&
    typeof (payload.decision_basis as { decided_by_rule_id?: unknown })
      .decided_by_rule_id === "string"
      ? String(
          (payload.decision_basis as { decided_by_rule_id: string })
            .decided_by_rule_id,
        )
      : null) ??
    rules[0] ??
    null
  );
}

/** Human-readable story from APS payload conventions (see docs/APS_PAYLOAD.md). */
export function buildEventProvenance(input: {
  tool_name: string | null;
  action_kind: string;
  policy_decision: string;
  payload: unknown;
  /** Optional case-level decision text (same sentence as the case page). */
  caseDecision?: string | null;
}): EventProvenance | null {
  const payload =
    input.payload && typeof input.payload === "object"
      ? (input.payload as Record<string, unknown>)
      : null;

  if (input.caseDecision?.trim()) {
    return {
      summary: input.caseDecision.trim(),
      lines: [{ label: "Decision", value: input.caseDecision.trim() }],
    };
  }

  // Sealed bank decisions: plain sentence, never governed.action / policy_decision wording.
  if (
    payload &&
    typeof payload.outcome === "string" &&
    Array.isArray(payload.matched_rules) &&
    payload.attributes &&
    typeof payload.attributes === "object"
  ) {
    const attrs = payload.attributes as Record<string, unknown>;
    const rules = (payload.matched_rules as Array<{ rule_id?: string }>)
      .map((r) => r.rule_id)
      .filter((r): r is string => typeof r === "string" && r !== "");
    const decided = decidedRuleId(payload, rules);
    const amt = num(attrs.amount ?? attrs.amount_rwf ?? attrs.loan_amount);
    const cur = str(attrs.currency) ?? null;
    const approverName =
      str(attrs.approver_display_name) ??
      str(payload.approver_display_name) ??
      str(payload.approver_name);
    const approverRole =
      str(attrs.approver_role) ??
      str(payload.approver_role);
    const approvalReason =
      str(attrs.approval_reason) ??
      str(payload.approval_reason) ??
      str(payload.reason);
    const summary = describeDecision({
      outcome: payload.outcome as string,
      product: str(payload.product),
      event_type: str(payload.event_type),
      amount: amt,
      currency: cur,
      policy_version:
        typeof payload.policy_version === "number" ? payload.policy_version : null,
      matched_rules: rules.map((rule_id) => ({ rule_id })),
      decided_by_rule_id: decided,
      mode: str(payload.mode),
      would_have: str(payload.would_have),
      approver_name: approverName,
      approver_role: approverRole,
      approval_reason: approvalReason,
      approved_at: str(attrs.decided_at) ?? str(payload.decided_at),
      required_role: str(payload.required_role),
      required_role_label: str(payload.required_role_label),
    });
    const bankLines: Array<{ label: string; value: string }> = [];
    if (amt !== null) {
      bankLines.push({
        label: "Amount",
        value: formatRwf(amt, cur?.toUpperCase() ?? null),
      });
    }
    const ruleLabels = [
      ...new Set(
        (decided ? [decided, ...rules.filter((r) => r !== decided)] : rules)
          .map((id) => formatRuleLabel(id))
          .filter((x): x is string => Boolean(x)),
      ),
    ];
    if (ruleLabels.length > 0) {
      bankLines.push({ label: "Rules that applied", value: ruleLabels.join(", ") });
    }
    bankLines.push({
      label: "Outcome",
      value: OUTCOME_LABELS[payload.outcome as string] ?? String(payload.outcome),
    });
    if (approverName) {
      bankLines.push({
        label: "Approver",
        value: formatApprover(approverName, approverRole) ?? approverName,
      });
    }
    if (approvalReason) {
      bankLines.push({ label: "Reason", value: approvalReason });
    }
    if (payload.mode === "record_only") {
      bankLines.push({ label: "Mode", value: "Record only (not blocked)" });
    }
    return { summary, lines: bankLines };
  }

  // Human approval step: never "allowed automatically" (A4).
  if (input.action_kind === "human_approval" && payload) {
    const decision = str(payload.decision);
    const name = str(payload.approver_display_name) ?? str(payload.approver);
    const role = str(payload.approver_role);
    const email = str(payload.approver_email);
    const who =
      formatApprover(name, role) ?? name ?? "an authorised approver";
    const reason = str(payload.reason);
    const declined =
      decision === "rejected" ||
      decision === "declined" ||
      decision === "denied" ||
      input.policy_decision === "deny";
    const summary = declined
      ? `${who} declined${reason ? ` with the reason: ${reason.replace(/[.!?]+$/u, "")}` : ""}.`
      : `${who} approved${reason ? ` with the reason: ${reason.replace(/[.!?]+$/u, "")}` : ""}.`;
    const lines: Array<{ label: string; value: string }> = [
      { label: "Decision", value: declined ? "Declined" : "Approved" },
      { label: "Approver", value: who },
    ];
    if (email) lines.push({ label: "Approver email", value: email });
    if (reason) lines.push({ label: "Reason", value: reason });
    return { summary, lines };
  }

  const provider =
    str(payload?.provider) ??
    str(payload?.vendor) ??
    (input.tool_name &&
    input.tool_name !== "governed.action" &&
    input.tool_name !== "policy_decision"
      ? input.tool_name.split(".")[0] ?? null
      : null);
  const action =
    str(payload?.action) ??
    str(payload?.action_description) ??
    actionKindPlain(input.action_kind, input.tool_name);
  const amount = num(payload?.amount_usd ?? payload?.amount);
  const currency = str(payload?.currency) ?? (amount !== null ? "USD" : null);
  const trigger =
    str(payload?.trigger_source) ??
    str(payload?.trigger) ??
    str(payload?.triggered_by);
  const triggerDetail = str(payload?.trigger_detail) ?? str(payload?.trigger_reason);
  const resource = str(payload?.resource_id) ?? str(payload?.transaction_id);
  const businessContext = str(payload?.business_context);
  const investorSummary = userFacingSummary(payload?.investor_summary);
  const riskIfUnmonitored = str(payload?.risk_if_unmonitored);
  const purpose = str(payload?.purpose);
  const dataTouched = Array.isArray(payload?.data_touched)
    ? payload.data_touched.filter((x): x is string => typeof x === "string")
    : [];

  const lines: Array<{ label: string; value: string }> = [];
  if (investorSummary) {
    lines.push({ label: "Summary", value: investorSummary });
  }
  if (businessContext) {
    lines.push({ label: "Business context", value: businessContext });
  }
  if (purpose) {
    lines.push({ label: "Purpose", value: purpose });
  }
  if (provider) {
    lines.push({ label: "Provider", value: provider });
  }
  if (
    input.tool_name &&
    input.tool_name !== "governed.action" &&
    input.tool_name !== "policy_decision"
  ) {
    lines.push({ label: "Tool", value: input.tool_name });
  }
  lines.push({ label: "Action", value: action });
  if (amount !== null) {
    lines.push({
      label: "Amount",
      value: currency ? `${amount} ${currency}` : String(amount),
    });
  }
  if (trigger) {
    lines.push({
      label: "Triggered by",
      value: triggerDetail ? `${trigger}: ${triggerDetail}` : trigger,
    });
  }
  if (resource) {
    lines.push({ label: "Resource", value: resource });
  }
  if (dataTouched.length > 0) {
    lines.push({ label: "Data touched", value: dataTouched.join(", ") });
  }
  if (riskIfUnmonitored) {
    lines.push({ label: "Risk if unmonitored", value: riskIfUnmonitored });
  }

  const requestPayload =
    payload?.request_payload && typeof payload.request_payload === "object"
      ? (payload.request_payload as Record<string, unknown>)
      : null;
  if (requestPayload) {
    const reqAmount = num(requestPayload.amount_usd ?? requestPayload.amount);
    if (reqAmount !== null) {
      lines.push({ label: "Requested amount", value: `$${reqAmount} USD` });
    }
    for (const [key, value] of Object.entries(requestPayload)) {
      if (key === "amount_usd" || key === "amount") continue;
      if (value == null || typeof value === "object") continue;
      lines.push({ label: key, value: String(value) });
      if (lines.length > 12) break;
    }
  }

  lines.push({
    label: "Outcome",
    value: outcomeFromPolicyDecision(input.policy_decision).label,
  });

  if (lines.length <= 1 && !input.tool_name && input.action_kind !== "llm_invocation") {
    return null;
  }

  const parts: string[] = [];
  if (investorSummary) {
    parts.push(investorSummary);
  } else if (provider && amount !== null) {
    parts.push(
      `${provider} processed ${amount}${currency ? ` ${currency}` : ""}`,
    );
  } else if (provider) {
    parts.push(`${provider}: ${action}`);
  } else if (
    input.tool_name &&
    input.tool_name !== "governed.action" &&
    input.tool_name !== "policy_decision"
  ) {
    parts.push(`${input.tool_name}: ${action}`);
  } else {
    parts.push(action);
  }
  if (trigger) {
    parts.push(`triggered by ${trigger}${triggerDetail ? ` (${triggerDetail})` : ""}`);
  }
  parts.push(outcomeFromPolicyDecision(input.policy_decision).label.toLowerCase());

  return { summary: parts.join(" · "), lines };
}
