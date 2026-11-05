/**
 * Layer-1 case story: header sentence + four answers (Claude §11.1, §11.6).
 */

import {
  actionKindPlain,
  outcomeFromPolicyDecision,
  outcomeFromTraceStatus,
  type OutcomeDisplay,
} from "./outcome-vocab";

export type CaseEventLike = {
  action_kind: string;
  policy_decision: string;
  tool_name: string | null;
  payload: unknown;
  emitted_at?: string;
  actor_principal?: string | null;
};

export type CaseFourAnswers = {
  whatHappened: { title: string; detail: string };
  who: { title: string; detail: string };
  whyAllowed: { title: string; detail: string };
  canTrust: { title: string; detail: string; verifiedHint: string };
};

export type CaseStory = {
  headline: string;
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
  reference: string | null;
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

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
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
  let subject: string | null = null;
  let hasPolicyDecision = false;
  let obligation = false;
  let denied = false;
  let allowedPayment = false;
  let decisionLayer: string | null = null;
  let evaluationContext: Record<string, unknown> | null = null;

  for (const e of events) {
    const p = payloadRecord(e.payload);
    const amount = num(p?.amount_usd ?? p?.amount ?? p?.refund_amount_usd);
    if (amount != null) amountUsd = amount;

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
    subject =
      subject ??
      str(p?.task) ??
      str(p?.subject) ??
      str(p?.email_subject) ??
      str(p?.summary) ??
      str(p?.business_context) ??
      str(p?.trigger_detail);

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
      ruleReason =
        str(p?.reason) ??
        str(p?.investor_summary) ??
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
  opts?: { anomaly?: boolean; dataAccess?: boolean; subject?: string | null },
): string {
  const tool = toolLabel ?? "";
  if (opts?.anomaly && opts?.dataAccess) {
    return "Sensitive data access";
  }
  if (opts?.anomaly) {
    return "Flagged agent behaviour";
  }
  if (opts?.dataAccess || tool.includes("aegis.data.")) {
    return "Data access";
  }
  if (opts?.subject && (tool.startsWith("demo.") || tool.includes("trace.") || !tool)) {
    return opts.subject;
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
    return opts?.subject ?? "Recorded action";
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
    status: string;
    pendingApproval?: boolean;
    deniedEvents?: number;
    startedAt?: string;
  },
): CaseStory {
  const c = collectFromEvents(events);
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
  });
  const refBit = c.reference ? ` for ${c.reference}` : "";

  const seen = readSentence(c.dataTouched);
  const flagLine = c.anomalyFlagged
    ? c.anomalyReason
      ? anomalyLead(c.anomalyType, c.anomalyReason)
      : GENERIC_FLAG
    : null;

  let headline: string;
  if (flagLine && c.denied) {
    headline = `Stopped. ${flagLine}`;
  } else if (flagLine && waitingForPerson) {
    headline = `${flagLine} Needs approval before this can continue.`;
  } else if (c.denied) {
    const reasonLower = (c.ruleReason ?? "").toLowerCase();
    if (reasonLower.includes("does not match the customer on record")) {
      headline =
        "Stopped: refund destination does not match the customer on record.";
    } else {
      headline = `${action}${refBit} was stopped by a rule before money moved.`;
    }
  } else if (c.obligation && (c.approvalDecision === "approved" || c.allowedPayment)) {
    const who = c.approver ?? "a person";
    const when = c.approvalAt
      ? ` at ${new Date(c.approvalAt).toLocaleString()}`
      : "";
    headline = `${action}${refBit} was approved by ${who} and completed${when}.`;
  } else if (waitingForPerson) {
    headline = `${action}${refBit} needs approval.`;
  } else if (c.obligation && c.approvalDecision === "rejected") {
    headline = `${action}${refBit} was declined by ${c.approver ?? "a person"}.`;
  } else if (flagLine) {
    headline = flagLine;
  } else if (seen && !c.amountUsd) {
    headline = seen.replace(/\.$/, "");
  } else if (outcome.kind === "allow" || meta.status === "completed" || c.hasPolicyDecision) {
    headline = `${action}${refBit} completed.`;
  } else {
    headline = `${action}${refBit}. ${outcome.label}.`;
  }

  const listSentence = flagLine
    ? flagLine
    : seen
      ? seen.replace(/\.$/, "")
      : c.reference
        ? `${action} for ${c.reference}`
        : c.subject
          ? c.subject
          : action;

  const layerBit =
    c.decisionLayer === "ceiling"
      ? "Layer: hard ceiling."
      : c.decisionLayer === "contextual"
        ? "Layer: contextual rule."
        : c.decisionLayer === "override"
          ? "Layer: time-boxed override."
          : c.decisionLayer === "agent"
            ? "Layer: agent kill switch."
            : null;

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
      ? ` Context used for the rule: ${contextBits.join(", ")}.`
      : "";

  let whyDetail: string;
  if (c.denied) {
    whyDetail = [
      c.ruleReason ?? "A policy rule stopped this action.",
      layerBit,
      c.policyId ? `Rule set: ${c.policyId}.` : null,
      contextLine.trim() || null,
    ]
      .filter(Boolean)
      .join(" ");
  } else if (c.obligation) {
    whyDetail = [
      c.ruleReason ?? "A rule required a person before this could run.",
      layerBit,
      c.approver
        ? `Decision: ${c.approvalDecision ?? "recorded"} by ${c.approver}.`
        : waitingForPerson
          ? "No decision yet — open Approvals."
          : null,
      contextLine.trim() || null,
    ]
      .filter(Boolean)
      .join(" ");
  } else if (flagLine) {
    whyDetail = [
      flagLine,
      c.ruleReason,
      "This case needs a person to look at it.",
    ]
      .filter(Boolean)
      .join(" ");
  } else {
    whyDetail = [
      c.ruleReason ??
        "Policy allowed this path automatically. The sealed record still shows what was evaluated.",
      layerBit,
      contextLine.trim() || null,
    ]
      .filter(Boolean)
      .join(" ");
  }

  const fourAnswers: CaseFourAnswers = {
    whatHappened: {
      title: "What happened?",
      detail: [headline, seen && !headline.includes(seen.replace(/\.$/, "")) ? seen : null]
        .filter(Boolean)
        .join(" "),
    },
    who: {
      title: "Who did it, and for whom?",
      detail: [
        `Agent: ${meta.agentId}.`,
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
      detail:
        "Every step is sealed in an append-only chain. Changing a field after the fact breaks verification.",
      verifiedHint: "Verified: open Technical details or Verify for the cryptographic check.",
    },
  };

  const attempted = flagLine
    ? [flagLine, seen || null].filter(Boolean).join(" ")
    : seen
      ? seen
      : `${action}${refBit}`;

  return {
    headline,
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
    approver: c.approver,
    approvalDecision: c.approvalDecision,
    approvalAt: c.approvalAt,
    evaluationContext: c.evaluationContext,
    amountUsd: c.amountUsd,
    reference: c.reference,
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
  if (flagLine && needsPerson) {
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
  } else if (t.preview_subject) {
    sentence = t.preview_subject;
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
  if (actionKind === "data_access" && seen) return seen.replace(/\.$/, "");
  if (actionKind === "anomaly_signal") {
    const reason = str(p?.reason);
    return reason ? anomalyLead(str(p?.type), reason) : GENERIC_FLAG;
  }
  const subject =
    str(p?.task) ??
    str(p?.subject) ??
    str(p?.email_subject) ??
    str(p?.summary) ??
    str(p?.business_context);
  if (subject && actionKind === "tool_call" && !toolName?.includes("trace.")) {
    return subject;
  }
  const base = actionKindPlain(actionKind, toolName);
  if (actionKind === "policy_decision") {
    const o = outcomeFromPolicyDecision(policyDecision);
    const reason = str(p?.reason);
    return reason ? `Rule check: ${reason}` : `${base}: ${o.chip}`;
  }
  if (actionKind === "human_approval") {
    const o = outcomeFromPolicyDecision(policyDecision);
    return o.kind === "approved" || policyDecision === "allow"
      ? "A person approved"
      : o.kind === "declined" || policyDecision === "deny"
        ? "A person declined"
        : base;
  }
  return base;
}
