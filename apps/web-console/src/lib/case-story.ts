/**
 * Layer-1 case story: header sentence + four answers (Claude §11.1, §11.6).
 */

import {
  actionKindPlain,
  outcomeFromPolicyDecision,
  outcomeFromTraceStatus,
  type OutcomeDisplay,
} from "./outcome-vocab";
import {
  actionLabel,
  describeDecision,
  formatApprover,
  formatRoleLabel,
  formatRuleLabel,
  type DescribeDecisionInput,
} from "./describe-decision";
import type { CaseApprover } from "./types";
import { formatRwf } from "./format-display";

export type CaseEventLike = {
  action_kind: string;
  policy_decision: string;
  tool_name: string | null;
  payload: unknown;
  emitted_at?: string;
  actor_principal?: string | null;
  chain_valid?: boolean;
};

export type CaseFourAnswers = {
  whatHappened: { title: string; detail: string };
  who: { title: string; detail: string };
  whyAllowed: { title: string; detail: string };
  canTrust: { title: string; detail: string; verifiedHint: string };
};

export type CaseStory = {
  /** Primary title from the event task (or narrative fallback). */
  headline: string;
  /** Supporting copy from event summary when present. */
  description: string | null;
  listSentence: string;
  outcome: OutcomeDisplay;
  fourAnswers: CaseFourAnswers;
  dataTouched: string[];
  dataSensitivity: string | null;
  anomalyReason: string | null;
  anomalySeverity: string | null;
  /** Shown whenever an anomaly was recorded, including when no reason was given. */
  flagSummary: string | null;
  attempted: string;
  policyReason: string | null;
  policyId: string | null;
  waitingForPerson: boolean;
  approver: string | null;
  approvalDecision: string | null;
  approvalAt: string | null;
  evaluationContext: Record<string, unknown> | null;
  amountUsd: number | null;
  /** e.g. `EUR 8,000` — currency from the event/pack, never invented. */
  amountDisplay: string | null;
  reference: string | null;
  /** Plain sentence for bank cases (describeDecision); null for non-bank cases. */
  bankDecision: string | null;
  /** Rule ids that decided the case. */
  ruleIds: string[];
  /** Allowed automatically: "No approval needed: allowed automatically by rule X". */
  noApprovalNeeded: string | null;
  /** Every field seen, with how field policy treated it. Never empty when attributes exist. */
  dataSeen: DataSeenField[];
};

export type DataSeenField = {
  field: string;
  label: string;
  treatment: "stored" | "masked" | "hashed" | "name_only";
  /** Display value for stored fields (amount formatted); null when masked or hashed. */
  value: string | null;
};

/** Optional facts from GET /cases/summary that the sealed events do not carry. */
export type CaseSummaryMeta = {
  required_role?: string | null;
  amount?: number | null;
  currency?: string | null;
  product?: string | null;
  event_type?: string | null;
  rules?: string[];
  /** Rule that drove the outcome (the hold rule, not the AUTH-RL allow). */
  decided_by_rule_id?: string | null;
  /** Approve/decline votes with display names (emails stay in Technical details). */
  approvers?: CaseApprover[];
};

function payloadRecord(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === "object"
    ? (payload as Record<string, unknown>)
    : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function moneyFmt(n: number, currency?: string | null): string {
  if (currency) return formatRwf(n, currency.toUpperCase());
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function humanField(field: string): string {
  return field
    .replace(/[.-]+/g, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\bid\b/gi, "ID")
    .replace(/\busd\b/gi, "USD");
}

function readSentence(fields: string[]): string {
  const labels = [...new Set(fields.map(humanField).filter(Boolean))];
  if (labels.length === 0) return "";
  if (labels.length === 1) return `Read ${labels[0]}.`;
  if (labels.length === 2) return `Read ${labels[0]} and ${labels[1]}.`;
  return `Read ${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}.`;
}

const GENERIC_FLAG = "Suspicious behaviour flagged — review required";

function endSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function anomalyLead(type: string | null, reason: string): string {
  if (type === "prompt_injection_indicator") {
    return `Possible prompt injection detected: ${reason}`;
  }
  if (type === "sensitive_data_exfiltration") {
    return `Possible attempt to take extra customer data: ${reason}`;
  }
  if (type === "unexpected_tool") {
    return `Unexpected action detected: ${reason}`;
  }
  return `Flagged: ${reason}`;
}

function pushFields(target: string[], value: unknown) {
  if (!Array.isArray(value)) return;
  for (const f of value) {
    if (typeof f === "string" && f.trim()) target.push(f.trim());
  }
}


function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/** Governed bank decisions seal outcome + matched_rules + attributes in the payload. */
function isBankPayload(p: Record<string, unknown> | null): boolean {
  return Boolean(
    p &&
      typeof p.outcome === "string" &&
      Array.isArray(p.matched_rules) &&
      isRecord(p.attributes),
  );
}

function ruleIdsFromPayload(p: Record<string, unknown> | null): string[] {
  const rules = Array.isArray(p?.matched_rules) ? (p!.matched_rules as unknown[]) : [];
  return [
    ...new Set(
      rules
        .map((r) => (isRecord(r) ? str(r.rule_id) : null))
        .filter((x): x is string => Boolean(x)),
    ),
  ];
}

function treatmentOf(value: unknown): DataSeenField["treatment"] {
  if (typeof value === "string") {
    if (value.startsWith("sha256:")) return "hashed";
    if (/^\*{2,}/.test(value)) return "masked";
  }
  return "stored";
}

function humanLabel(field: string): string {
  const h = humanField(field);
  return h ? h.charAt(0).toUpperCase() + h.slice(1) : field;
}

function displayValue(field: string, value: unknown, currency: string | null): string | null {
  if (value == null) return null;
  if (typeof value === "number" && /amount|limit|balance|principal/i.test(field)) {
    return currency ? formatRwf(value, currency.toUpperCase()) : value.toLocaleString("en-US");
  }
  if (typeof value === "number") return value.toLocaleString("en-US");
  if (typeof value === "string" || typeof value === "boolean") return String(value);
  return null;
}

/**
 * Fields the case saw, with how field policy treated each. Built from the stored
 * attributes (masked values start with `*`, hashed with `sha256:`), then any
 * fields named in data_touched / fields_accessed.
 */
function collectDataSeen(
  attributes: Record<string, unknown> | null,
  evaluationContext: Record<string, unknown> | null,
  touched: string[],
): DataSeenField[] {
  const out: DataSeenField[] = [];
  const seen = new Set<string>();
  const currency = attributes && typeof attributes.currency === "string" ? attributes.currency : null;

  function add(field: string, value: unknown) {
    if (seen.has(field)) return;
    seen.add(field);
    const treatment = treatmentOf(value);
    out.push({
      field,
      label: humanLabel(field),
      treatment,
      value: treatment === "stored" ? displayValue(field, value, currency) : null,
    });
  }

  function walk(prefix: string, obj: Record<string, unknown>, depth: number) {
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (isRecord(v) && depth < 2) walk(path, v, depth + 1);
      else add(path, v);
    }
  }

  if (attributes) walk("", attributes, 0);
  if (evaluationContext) {
    for (const [k, v] of Object.entries(evaluationContext)) {
      if (k === "fields_accessed" || v == null || v === "") continue;
      if (isRecord(v) || Array.isArray(v)) continue;
      add(k, v);
    }
  }
  for (const f of touched) {
    if (seen.has(f)) continue;
    seen.add(f);
    out.push({ field: f, label: humanLabel(f), treatment: "name_only", value: null });
  }
  return out;
}

export const TREATMENT_LABEL: Record<DataSeenField["treatment"], string> = {
  stored: "stored as sent",
  masked: "masked",
  hashed: "hashed",
  name_only: "named only, value not kept",
};
/** True when the payload clearly came from an email workflow. */
function isEmailSourced(p: Record<string, unknown> | null): boolean {
  if (!p) return false;
  const source = str(p.source)?.toLowerCase() ?? "";
  if (source === "email" || source.includes("email")) return true;
  return Boolean(str(p.email_from) || str(p.email_to) || str(p.mailbox));
}

/**
 * Case title from the event itself (task first). Never use agent names.
 * email_subject is only a fallback for email-sourced cases.
 */
export function titleFromPayload(p: Record<string, unknown> | null): string | null {
  if (!p) return null;
  return (
    str(p.task) ??
    str(p.subject) ??
    str(p.business_context) ??
    str(p.trigger_detail) ??
    (isEmailSourced(p) ? str(p.email_subject) : null)
  );
}

export function descriptionFromPayload(
  p: Record<string, unknown> | null,
): string | null {
  if (!p) return null;
  return str(p.summary);
}

function pickTitleAndDescription(events: CaseEventLike[]): {
  subject: string | null;
  description: string | null;
  emailCase: boolean;
} {
  let subject: string | null = null;
  let description: string | null = null;
  let emailCase = false;
  let emailSubjectFallback: string | null = null;

  for (const e of events) {
    const p = payloadRecord(e.payload);
    if (isEmailSourced(p)) emailCase = true;
    subject = subject ?? str(p?.task);
    description = description ?? descriptionFromPayload(p);
    emailSubjectFallback = emailSubjectFallback ?? str(p?.email_subject);
  }
  if (!subject) {
    for (const e of events) {
      const p = payloadRecord(e.payload);
      subject =
        subject ??
        str(p?.subject) ??
        str(p?.business_context) ??
        str(p?.trigger_detail);
      if (subject) break;
    }
  }
  if (!subject && emailCase) {
    subject = emailSubjectFallback;
  }

  return { subject, description, emailCase };
}

function collectFromEvents(events: CaseEventLike[]) {
  let amountUsd: number | null = null;
  let reference: string | null = null;
  let ticketId: string | null = null;
  let orderId: string | null = null;
  let toolLabel: string | null = null;
  let ruleReason: string | null = null;
  let policyId: string | null = null;
  let approver: string | null = null;
  let approvalDecision: string | null = null;
  let approvalAt: string | null = null;
  let dataTouched: string[] = [];
  let dataSensitivity: string | null = null;
  let anomalyReason: string | null = null;
  let anomalySeverity: string | null = null;
  let anomalyType: string | null = null;
  let anomalyFlagged = false;
  let hasPolicyDecision = false;
  let obligation = false;
  let denied = false;
  let allowedPayment = false;
  let decisionLayer: string | null = null;
  let evaluationContext: Record<string, unknown> | null = null;
  let bankPayload: Record<string, unknown> | null = null;
  let currency: string | null = null;

  const { subject, description } = pickTitleAndDescription(events);

  for (const e of events) {
    const p = payloadRecord(e.payload);
    const attrs = isRecord(p?.attributes) ? (p!.attributes as Record<string, unknown>) : null;
    const amount = num(
      p?.amount_usd ??
        p?.amount ??
        p?.refund_amount_usd ??
        attrs?.amount ??
        attrs?.amount_rwf ??
        attrs?.loan_amount,
    );
    if (amount != null) amountUsd = amount;
    currency = currency ?? str(attrs?.currency) ?? str(p?.currency);
    if (isBankPayload(p)) bankPayload = p;

    ticketId = ticketId ?? str(p?.ticket_id);
    orderId = orderId ?? str(p?.order_id);
    pushFields(dataTouched, p?.fields_accessed);
    pushFields(dataTouched, p?.data_touched);
    pushFields(dataTouched, p?.fields);
    const ecEarly = p?.evaluation_context;
    if (ecEarly && typeof ecEarly === "object" && !Array.isArray(ecEarly)) {
      pushFields(dataTouched, (ecEarly as Record<string, unknown>).fields_accessed);
    }
    dataSensitivity =
      dataSensitivity ??
      str(p?.sensitivity) ??
      str(p?.classification);

    if (e.action_kind === "anomaly_signal") {
      anomalyFlagged = true;
      anomalyReason = str(p?.reason) ?? anomalyReason;
      anomalySeverity = str(p?.severity) ?? anomalySeverity;
      anomalyType = str(p?.type) ?? anomalyType;
      if (e.policy_decision === "allow_with_obligation") obligation = true;
      if (e.policy_decision === "deny") denied = true;
    }

    if (e.action_kind === "data_access") {
      toolLabel = e.tool_name ?? toolLabel;
    }

    if (e.action_kind === "policy_decision") {
      toolLabel = e.tool_name ?? toolLabel;
      // investor_summary ("Governed decision ... for case ...") is internal wording: never show it.
      ruleReason =
        str(p?.reason) ??
        (isBankPayload(p) ? null : str(p?.investor_summary)) ??
        str(p?.business_context) ??
        ruleReason;
      policyId = str(p?.policy_id) ?? policyId;
      decisionLayer = str(p?.decision_layer) ?? decisionLayer;
      const ec = p?.evaluation_context;
      if (ec && typeof ec === "object" && !Array.isArray(ec)) {
        evaluationContext = ec as Record<string, unknown>;
      }
      hasPolicyDecision = true;
      if (e.policy_decision === "deny") denied = true;
      if (e.policy_decision === "allow_with_obligation") obligation = true;
      if (e.policy_decision === "allow" && e.tool_name?.includes("stripe")) {
        allowedPayment = true;
      }
    }

    if (e.action_kind === "human_approval") {
      approver =
        str(p?.approver_email) ??
        str(p?.approver) ??
        e.actor_principal ??
        approver;
      approvalDecision = str(p?.decision) ?? e.policy_decision ?? approvalDecision;
      approvalAt = e.emitted_at ?? approvalAt;
    }

    if (e.action_kind === "result" && e.tool_name?.includes("stripe")) {
      allowedPayment = true;
      toolLabel = e.tool_name ?? toolLabel;
    }
  }

  dataTouched = [...new Set(dataTouched)];
  reference = ticketId ?? orderId;
  return {
    bankPayload,
    currency,
    amountUsd,
    reference,
    ticketId,
    orderId,
    toolLabel,
    ruleReason,
    policyId,
    approver,
    approvalDecision,
    approvalAt,
    dataTouched,
    dataSensitivity,
    anomalyReason,
    anomalySeverity,
    anomalyType,
    anomalyFlagged,
    subject,
    description,
    hasPolicyDecision,
    evaluationContext,
    obligation,
    denied,
    allowedPayment,
    decisionLayer,
  };
}

function actionNoun(
  toolLabel: string | null,
  amountUsd: number | null,
  opts?: {
    anomaly?: boolean;
    dataAccess?: boolean;
    subject?: string | null;
    currency?: string | null;
  },
): string {
  const tool = toolLabel ?? "";
  const money = (n: number) => moneyFmt(n, opts?.currency);
  // governed.action is an internal tool name; never show it.
  if (tool === "governed.action") {
    return amountUsd != null ? `Action of ${money(amountUsd)}` : "Action";
  }
  // Event task/title wins over generic "Data access" / tool labels.
  if (opts?.subject) {
    return opts.subject;
  }
  if (opts?.anomaly && opts?.dataAccess) {
    return "Sensitive data access";
  }
  if (opts?.anomaly) {
    return "Flagged agent behaviour";
  }
  if (opts?.dataAccess || tool.includes("aegis.data.")) {
    return "Data access";
  }
  if (tool.includes("paymentIntents") || tool.includes("refund")) {
    return amountUsd != null ? `Refund of ${money(amountUsd)}` : "Refund";
  }
  if (tool.includes("payout") || tool.includes("transfer")) {
    return amountUsd != null ? `Payout of ${money(amountUsd)}` : "Payout";
  }
  if (tool.includes("anomaly")) {
    return "Flagged agent behaviour";
  }
  if (tool.startsWith("demo.")) {
    return "Recorded action";
  }
  if (tool) {
    return amountUsd != null
      ? `${actionKindPlain("tool_call", tool)} (${money(amountUsd)})`
      : actionKindPlain("tool_call", tool);
  }
  return amountUsd != null ? `Action of ${money(amountUsd)}` : "Agent action";
}

export function buildCaseStory(
  events: CaseEventLike[],
  meta: {
    traceId: string;
    agentId: string;
    agentName?: string | null;
    status: string;
    pendingApproval?: boolean;
    deniedEvents?: number;
    startedAt?: string;
    summary?: CaseSummaryMeta | null;
  },
): CaseStory {
  const c = collectFromEvents(events);
  const bp = c.bankPayload;
  const bankAttributes = isRecord(bp?.attributes)
    ? (bp!.attributes as Record<string, unknown>)
    : null;
  const ruleIds = bp ? ruleIdsFromPayload(bp) : (meta.summary?.rules ?? []);
  const displayCurrency = c.currency ?? meta.summary?.currency ?? null;
  const displayAmount = c.amountUsd ?? meta.summary?.amount ?? null;
  const amountDisplay =
    displayAmount != null ? moneyFmt(displayAmount, displayCurrency) : null;

  let bankDecision: string | null = null;
  let noApprovalNeeded: string | null = null;
  /** "Jean Mutabazi · Credit Manager" when the summary names the approver, else the raw actor. */
  let approverShown: string | null = c.approver;
  if (bp) {
    const bankOutcome = str(bp.outcome) ?? "allow";
    const approved = c.approvalDecision === "approved";
    const declined =
      c.approvalDecision === "rejected" ||
      c.approvalDecision === "denied" ||
      c.approvalDecision === "declined";
    // Prefer the summary's named approver (name · role); emails stay in Technical details.
    const votes = meta.summary?.approvers ?? [];
    const vote =
      votes.find((a) => a.email && a.email === c.approver) ??
      votes.find((a) =>
        declined
          ? ["rejected", "declined", "denied"].includes(a.decision)
          : a.decision === "approved",
      ) ??
      null;
    const approverName = vote?.name ?? (vote ? formatRoleLabel(vote.role) : null) ?? c.approver;
    const approverRole = vote?.name ? (vote.role ?? null) : null;
    if (vote) approverShown = formatApprover(approverName, approverRole) ?? approverName;
    const decidedBy =
      meta.summary?.decided_by_rule_id ??
      str(bp.decided_by_rule_id) ??
      (isRecord(bp.decision_basis) ? str(bp.decision_basis.decided_by_rule_id) : null) ??
      (bankOutcome === "hold" || bankOutcome === "stop"
        ? ruleIds.find((r) => !/(^|_)AUTH-RL$/.test(r))
        : null) ??
      ruleIds[0] ??
      null;
    const input: DescribeDecisionInput = {
      outcome:
        bankOutcome === "hold" && declined
          ? "declined"
          : bankOutcome === "hold" && approved
            ? "released"
            : bankOutcome,
      product: str(bp.product) ?? meta.summary?.product ?? null,
      event_type: str(bp.event_type) ?? meta.summary?.event_type ?? null,
      amount: displayAmount,
      currency: displayCurrency ?? null,
      policy_version:
        typeof bp.policy_version === "number" || typeof bp.policy_version === "string"
          ? bp.policy_version
          : null,
      matched_rules: ruleIds.map((rule_id) => ({ rule_id })),
      decided_by_rule_id: decidedBy,
      required_role: meta.summary?.required_role ?? null,
      approver_name: approved || declined ? approverName : null,
      approver_role: approved || declined ? approverRole : null,
      approved_at: approved || declined ? (c.approvalAt ?? vote?.decided_at ?? null) : null,
      approval_reason: approved || declined ? (vote?.reason ?? null) : null,
      mode: str(bp.mode),
      would_have: str(bp.would_have),
    };
    bankDecision = describeDecision(input);
    if (bankOutcome === "allow" && !str(bp.would_have)) {
      const allowLabel = formatRuleLabel(decidedBy, "allow");
      noApprovalNeeded = `No approval needed: allowed automatically${
        allowLabel ? ` by rule ${allowLabel}` : " by policy"
      }.`;
    }
  }
  const dataSeen = collectDataSeen(bankAttributes, c.evaluationContext, c.dataTouched);
  const waitingForPerson =
    Boolean(meta.pendingApproval) ||
    (c.obligation && !c.approver && c.approvalDecision !== "rejected");
  let outcome = outcomeFromTraceStatus(meta.status, {
    pendingApproval: waitingForPerson,
    deniedEvents: meta.deniedEvents,
    hasPolicyDecision: c.hasPolicyDecision,
    anomaly: c.anomalyFlagged && !waitingForPerson && !c.denied,
  });
  if (waitingForPerson) {
    outcome = {
      kind: "ask_person",
      label: "Needs approval",
      chip: "Needs approval",
    };
  } else if (c.anomalyFlagged && !c.denied) {
    outcome = {
      kind: "failed",
      label: "Flagged — needs attention",
      chip: "Flagged",
    };
  }

  const action = actionNoun(c.toolLabel, c.amountUsd, {
    anomaly: c.anomalyFlagged,
    dataAccess: c.dataTouched.length > 0,
    subject: c.subject,
    currency: displayCurrency,
  });
  const refBit = c.reference ? ` for ${c.reference}` : "";

  const seen = readSentence(c.dataTouched);
  const flagLine = c.anomalyFlagged
    ? c.anomalyReason
      ? anomalyLead(c.anomalyType, c.anomalyReason)
      : GENERIC_FLAG
    : null;

  // Prefer the event task as the page title; fall back to a short narrative.
  let headline: string;
  if (c.subject) {
    headline = c.subject;
  } else if (bankDecision && !flagLine) {
    headline = bankDecision;
  } else if (flagLine && c.denied) {
    headline = `Stopped. ${endSentence(flagLine)}`;
  } else if (flagLine && waitingForPerson) {
    headline = `${endSentence(flagLine)} Needs approval before this can continue.`;
  } else if (c.denied) {
    const reasonLower = (c.ruleReason ?? "").toLowerCase();
    if (reasonLower.includes("does not match the customer on record")) {
      headline =
        "Stopped: refund destination does not match the customer on record.";
    } else {
      headline = `${action}${refBit} was stopped by a rule before money moved.`;
    }
  } else if (c.obligation && (c.approvalDecision === "approved" || c.allowedPayment)) {
    const who = approverShown ?? "a person";
    const when = c.approvalAt
      ? ` at ${new Date(c.approvalAt).toLocaleString()}`
      : "";
    headline = `${action}${refBit} was approved by ${who} and completed${when}.`;
  } else if (waitingForPerson) {
    headline = `${action}${refBit} needs approval.`;
  } else if (c.obligation && c.approvalDecision === "rejected") {
    headline = `${action}${refBit} was declined by ${approverShown ?? "a person"}.`;
  } else if (flagLine) {
    headline = flagLine;
  } else if (seen && !c.amountUsd) {
    headline = seen.replace(/\.$/, "");
  } else if (outcome.kind === "allow" || meta.status === "completed" || c.hasPolicyDecision) {
    headline = `${action}${refBit} completed.`;
  } else {
    headline = `${action}${refBit}. ${outcome.label}.`;
  }

  const listSentence = bankDecision && !c.subject
    ? bankDecision
    : c.subject
    ? waitingForPerson
      ? `${c.subject} — needs approval`
      : c.denied
        ? `${c.subject} — stopped`
        : flagLine
          ? `${c.subject} — flagged`
          : c.subject
    : flagLine
      ? flagLine
      : seen
        ? seen.replace(/\.$/, "")
        : c.reference
          ? `${action} for ${c.reference}`
          : action;

  const contextBits: string[] = [];
  if (c.evaluationContext) {
    const tier = str(c.evaluationContext.customer_tier);
    const product = str(c.evaluationContext.product_type);
    const pattern = str(c.evaluationContext.previous_pattern);
    if (tier) contextBits.push(`customer tier ${tier}`);
    if (product) contextBits.push(`product ${product}`);
    if (pattern) contextBits.push(`prior pattern ${pattern}`);
  }
  const contextLine =
    contextBits.length > 0
      ? `Based on ${contextBits.join(", ")}.`
      : "";

  let whyDetail: string;
  if (bankDecision && !flagLine) {
    whyDetail = [
      bankDecision,
      c.approver && c.approvalDecision === "approved" && !/Approved by/.test(bankDecision)
        ? `Approved by ${approverShown}.`
        : null,
      waitingForPerson && !c.approver ? "No decision yet." : null,
    ]
      .filter(Boolean)
      .join(" ");
  } else if (c.denied) {
    whyDetail = [endSentence(c.ruleReason ?? "A rule stopped this action."), contextLine.trim() || null]
      .filter(Boolean)
      .join(" ");
  } else if (c.obligation) {
    whyDetail = [
      endSentence(c.ruleReason ?? "A person had to approve this first."),
      c.approver
        ? `${c.approvalDecision === "rejected" ? "Declined" : "Approved"} by ${approverShown}.`
        : waitingForPerson
          ? "No decision yet."
          : null,
    ]
      .filter(Boolean)
      .join(" ");
  } else if (flagLine) {
    whyDetail = endSentence(c.ruleReason ?? "Recorded for review.");
  } else {
    whyDetail = endSentence(c.ruleReason ?? "A rule allowed this.");
  }

  const whatDetail = [
    bankDecision && !c.description ? endSentence(bankDecision) : null,
    c.description ? endSentence(c.description) : null,
    seen ? endSentence(seen) : null,
    flagLine ? endSentence(flagLine) : null,
  ]
    .filter(Boolean)
    .join(" ");

  const fourAnswers: CaseFourAnswers = {
    whatHappened: {
      title: "What happened?",
      detail: whatDetail || endSentence(headline),
    },
    who: {
      title: "Who did it, and for whom?",
      detail: [
        `Agent: ${meta.agentName?.trim() || meta.agentId}.`,
        c.reference ? `Reference: ${c.reference}.` : null,
        c.ticketId && c.orderId && c.ticketId !== c.orderId
          ? `Order: ${c.orderId}.`
          : null,
      ]
        .filter(Boolean)
        .join(" "),
    },
    whyAllowed: {
      title: "Why was it allowed, and who approved?",
      detail: whyDetail,
    },
    canTrust: {
      title: "Can the record be trusted?",
      detail: events.every((e) => e.chain_valid !== false)
        ? "Verified. Each step is signed and the record is append-only."
        : "Each step is signed and the record is append-only. Changing a field after the fact breaks verification.",
      verifiedHint: events.every((e) => e.chain_valid !== false)
        ? "The signature chain is intact."
        : "Open Technical details to check the seal.",
    },
  };

  const bankWhat = bp
    ? (() => {
        const prod = str(bp.product) ?? meta.summary?.product ?? null;
        const evt = str(bp.event_type) ?? meta.summary?.event_type ?? null;
        const label = actionLabel(prod, evt);
        return amountDisplay ? `${label} of ${amountDisplay}` : label;
      })()
    : null;
  const attempted = c.subject || bankWhat || seen || `${action}${refBit}`;

  return {
    headline,
    description: c.description,
    listSentence,
    outcome,
    fourAnswers,
    dataTouched: c.dataTouched.map(humanField),
    dataSensitivity: c.dataSensitivity,
    anomalyReason: c.anomalyReason,
    anomalySeverity: c.anomalySeverity,
    flagSummary: flagLine,
    attempted,
    policyReason: c.ruleReason,
    policyId: c.policyId,
    waitingForPerson,
    approver: approverShown,
    approvalDecision: c.approvalDecision,
    approvalAt: c.approvalAt,
    evaluationContext: c.evaluationContext,
    amountUsd: c.amountUsd,
    amountDisplay,
    reference: c.reference,
    bankDecision,
    ruleIds,
    noApprovalNeeded,
    dataSeen,
  };
}

/** Lightweight list row when only TraceSummary is available (no events loaded). */
export function listSentenceFromTrace(t: {
  trace_id: string;
  agent_id: string;
  status: string;
  denied_events: number;
  pending_approval?: boolean;
  total_events: number;
  has_policy_decision?: boolean;
  needs_person?: boolean;
  preview_fields?: string[];
  preview_anomaly_reason?: string | null;
  preview_anomaly_type?: string | null;
  preview_subject?: string | null;
}): { sentence: string; outcome: OutcomeDisplay } {
  const needsPerson = Boolean(t.pending_approval || t.needs_person || t.status === "blocked");
  const fields = t.preview_fields ?? [];
  const seen = readSentence(fields);
  const flagLine = t.preview_anomaly_reason
    ? anomalyLead(t.preview_anomaly_type ?? null, t.preview_anomaly_reason)
    : t.preview_anomaly_type
      ? GENERIC_FLAG
      : null;
  const outcome = outcomeFromTraceStatus(t.status, {
    pendingApproval: needsPerson,
    deniedEvents: t.denied_events,
    hasPolicyDecision: t.has_policy_decision,
    anomaly: Boolean(flagLine) && !needsPerson && t.denied_events === 0,
  });
  let sentence: string;
  const title = t.preview_subject?.trim() || null;
  if (title) {
    if (flagLine && needsPerson) {
      sentence = `${title} — needs approval`;
    } else if (flagLine) {
      sentence = `${title} — flagged`;
    } else if (needsPerson) {
      sentence = `${title} — needs approval`;
    } else if (t.denied_events > 0) {
      sentence = `${title} — stopped`;
    } else {
      sentence = title;
    }
  } else if (flagLine && needsPerson) {
    sentence = `${flagLine} Needs approval.`;
  } else if (flagLine) {
    sentence = flagLine;
  } else if (needsPerson) {
    sentence = seen
      ? `${seen.replace(/\.$/, "")} — needs approval`
      : "Needs approval before this can continue";
  } else if (t.denied_events > 0) {
    sentence = seen ? `Stopped. ${seen}` : "Stopped by a rule";
  } else if (seen) {
    sentence = seen.replace(/\.$/, "");
  } else if (t.status === "completed" || t.has_policy_decision) {
    sentence = "Completed";
  } else {
    sentence = outcome.label;
  }
  return { sentence, outcome };
}

export function stepTitlePlain(
  actionKind: string,
  toolName: string | null,
  policyDecision: string,
  payload?: unknown,
): string {
  const p = payloadRecord(payload);
  const fields: string[] = [];
  pushFields(fields, p?.fields_accessed);
  pushFields(fields, p?.data_touched);
  pushFields(fields, p?.fields);
  const seen = readSentence(fields);
  const subject = titleFromPayload(p);
  if (subject && (actionKind === "data_access" || actionKind === "tool_call")) {
    return subject;
  }
  if (actionKind === "data_access" && seen) return seen.replace(/\.$/, "");
  if (actionKind === "anomaly_signal") {
    const reason = str(p?.reason);
    return reason ? anomalyLead(str(p?.type), reason) : GENERIC_FLAG;
  }
  const base = actionKindPlain(actionKind, toolName);
  if (actionKind === "policy_decision") {
    const o = outcomeFromPolicyDecision(policyDecision);
    if (isBankPayload(p)) {
      const attrs = p!.attributes as Record<string, unknown>;
      const rules = ruleIdsFromPayload(p);
      return describeDecision({
        outcome: str(p!.outcome) ?? "allow",
        product: str(p!.product),
        event_type: str(p!.event_type),
        amount: num(attrs.amount ?? attrs.amount_rwf ?? attrs.loan_amount),
        currency: str(attrs.currency) ?? null,
        matched_rules: rules.map((rule_id) => ({ rule_id })),
        decided_by_rule_id:
          str(p!.decided_by_rule_id) ??
          (isRecord(p!.decision_basis) ? str(p!.decision_basis.decided_by_rule_id) : null) ??
          (str(p!.outcome) === "hold" || str(p!.outcome) === "stop"
            ? rules.find((r) => !/(^|_)AUTH-RL$/.test(r))
            : null) ??
          rules[0] ??
          null,
        mode: str(p!.mode),
        would_have: str(p!.would_have),
      });
    }
    const reason = str(p?.reason);
    if (reason) return reason;
    // Never a bare "Rule check: Allowed": say which rule decided.
    const policyId = str(p?.policy_id);
    return policyId ? `${o.label} under rule ${policyId}` : o.label;
  }
  if (actionKind === "human_approval") {
    const o = outcomeFromPolicyDecision(policyDecision);
    return o.kind === "approved" || policyDecision === "allow"
      ? "A person approved"
      : o.kind === "declined" || policyDecision === "deny"
        ? "A person declined"
        : base;
  }
  return subject ?? base;
}
