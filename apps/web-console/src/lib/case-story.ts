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
    .replace(/_/g, " ")
    .replace(/\bemail\b/i, "email")
    .replace(/\busd\b/i, "USD");
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
  let obligation = false;
  let denied = false;
  let allowedPayment = false;
  let decisionLayer: string | null = null;

  for (const e of events) {
    const p = payloadRecord(e.payload);
    const amount = num(p?.amount_usd ?? p?.amount ?? p?.refund_amount_usd);
    if (amount != null) amountUsd = amount;

    ticketId = ticketId ?? str(p?.ticket_id);
    orderId = orderId ?? str(p?.order_id);
    const touched = p?.data_touched;
    if (Array.isArray(touched)) {
      for (const f of touched) {
        if (typeof f === "string") dataTouched.push(f);
      }
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
    obligation,
    denied,
    allowedPayment,
    decisionLayer,
  };
}

function actionNoun(toolLabel: string | null, amountUsd: number | null): string {
  const tool = toolLabel ?? "";
  if (tool.includes("paymentIntents") || tool.includes("refund")) {
    return amountUsd != null ? `Refund of ${money(amountUsd)}` : "Refund";
  }
  if (tool.includes("payout") || tool.includes("transfer")) {
    return amountUsd != null ? `Payout of ${money(amountUsd)}` : "Payout";
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
  const outcome = outcomeFromTraceStatus(meta.status, {
    pendingApproval: meta.pendingApproval,
    deniedEvents: meta.deniedEvents,
  });

  const action = actionNoun(c.toolLabel, c.amountUsd);
  const refBit = c.reference ? ` for ${c.reference}` : "";

  let headline: string;
  if (c.denied) {
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
  } else if (c.obligation && meta.pendingApproval) {
    headline = `${action}${refBit} is waiting for a person to approve.`;
  } else if (c.obligation && c.approvalDecision === "rejected") {
    headline = `${action}${refBit} was declined by ${c.approver ?? "a person"}.`;
  } else if (outcome.kind === "allow" || meta.status === "completed") {
    headline = `${action}${refBit} completed. Every step is sealed.`;
  } else {
    headline = `${action}${refBit}. ${outcome.label}.`;
  }

  const listSentence = c.reference
    ? `${action} for ${c.reference}`
    : `${action} · ${meta.agentId}`;

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

  let whyDetail: string;
  if (c.denied) {
    whyDetail = [
      c.ruleReason ?? "A policy rule stopped this action.",
      layerBit,
      c.policyId ? `Rule set: ${c.policyId}.` : null,
    ]
      .filter(Boolean)
      .join(" ");
  } else if (c.obligation) {
    whyDetail = [
      c.ruleReason ?? "A rule required a person before this could run.",
      layerBit,
      c.approver
        ? `Decision: ${c.approvalDecision ?? "recorded"} by ${c.approver}.`
        : meta.pendingApproval
          ? "No decision yet."
          : null,
    ]
      .filter(Boolean)
      .join(" ");
  } else {
    whyDetail = [
      "Policy allowed this path automatically. The sealed record still shows what was evaluated.",
      layerBit,
    ]
      .filter(Boolean)
      .join(" ");
  }

  const dataLine =
    c.dataTouched.length > 0
      ? `Data the AI saw: ${c.dataTouched.map(humanField).join(", ")}.`
      : "No customer data field labels were recorded on AI steps.";

  const fourAnswers: CaseFourAnswers = {
    whatHappened: {
      title: "What happened?",
      detail: `${headline} ${dataLine}`,
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

  return {
    headline,
    listSentence,
    outcome,
    fourAnswers,
    dataTouched: c.dataTouched.map(humanField),
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
}): { sentence: string; outcome: OutcomeDisplay } {
  const outcome = outcomeFromTraceStatus(t.status, {
    pendingApproval: t.pending_approval,
    deniedEvents: t.denied_events,
  });
  let sentence: string;
  if (t.pending_approval || t.status === "blocked") {
    sentence = `Action waiting for a person · ${t.agent_id}`;
  } else if (t.denied_events > 0) {
    sentence = `Risky action stopped · ${t.agent_id}`;
  } else if (t.status === "completed") {
    sentence = `Completed run · ${t.total_events} sealed step(s) · ${t.agent_id}`;
  } else {
    sentence = `${outcome.label} · ${t.agent_id}`;
  }
  return { sentence, outcome };
}

export function stepTitlePlain(
  actionKind: string,
  toolName: string | null,
  policyDecision: string,
): string {
  const base = actionKindPlain(actionKind, toolName);
  if (actionKind === "policy_decision") {
    const o = outcomeFromPolicyDecision(policyDecision);
    return `${base}: ${o.chip}`;
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
