import {
  newSpanId,
  newTraceId,
  PolicyDeniedError,
  recordDataAccess,
  recordDecision,
  recordLlmInvocation as sdkRecordLlm,
  recordProvenanceClaim,
  recordTraceStart,
  wrapFetch,
  type RecordContext,
} from "@salanor/aegis";
import type { PilotConfig } from "./config.js";

export { newTraceId };

export function preview(text: string, max = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export type Governance = {
  config: PilotConfig;
  traceId: string;
  recordCtx: RecordContext;
  sign: { privateKeyB64: string; keyId: string };
  ingest: { apiBaseUrl: string; ingestApiKey: string };
  spans: {
    session: string;
    triage: string;
    payment: string;
    reply: string;
  };
};

export function createGovernance(config: PilotConfig, traceId: string): Governance {
  return {
    config,
    traceId,
    recordCtx: {
      organizationId: config.organizationId,
      agentId: config.agentId,
      keyId: config.keyId,
      traceId,
      actorPrincipal: config.actorPrincipal,
    },
    sign: { privateKeyB64: config.privateKeyB64, keyId: config.keyId },
    ingest: { apiBaseUrl: config.apiBaseUrl, ingestApiKey: config.ingestApiKey },
    spans: {
      session: newSpanId(),
      triage: newSpanId(),
      payment: newSpanId(),
      reply: newSpanId(),
    },
  };
}

export async function startTraceSession(
  gov: Governance,
  input: { ticketId: string; summary: string },
): Promise<string> {
  return recordTraceStart(
    gov.recordCtx,
    {
      triggerSource: "support_ticket",
      triggerDetail: input.ticketId,
      businessContext: input.summary,
    },
    {
      sign: gov.sign,
      ingest: gov.ingest,
      spanId: gov.spans.session,
      spanLabel: "Ticket intake",
    },
  );
}

export async function recordLlmInvocation(
  gov: Governance,
  input: {
    toolName: string;
    purpose: string;
    prompt: string;
    response: string;
    dataTouched: string[];
    dataClassification: string;
    parentEventId?: string;
    triggerSource?: string;
    triggerDetail?: string;
    businessContext?: string;
    riskIfUnmonitored?: string;
    spanId?: string;
    spanLabel?: string;
  },
): Promise<string> {
  const investorSummary = input.businessContext
    ? `${input.businessContext} Data touched: ${input.dataTouched.join(", ")}.`
    : `AI step "${input.purpose}" on ${input.dataTouched.join(", ")}.`;

  return sdkRecordLlm(
    gov.recordCtx,
    {
      toolName: input.toolName,
      purpose: input.purpose,
      promptPreview: preview(input.prompt),
      responsePreview: preview(input.response),
      dataTouched: input.dataTouched,
      parentEventId: input.parentEventId,
      payload: {
        model: gov.config.geminiModel,
        data_classification: input.dataClassification,
        trigger_source: input.triggerSource ?? "support_ticket",
        trigger_detail: input.triggerDetail,
        business_context: input.businessContext,
        risk_if_unmonitored: input.riskIfUnmonitored,
        investor_summary: investorSummary,
      },
    },
    {
      sign: gov.sign,
      ingest: gov.ingest,
      spanId: input.spanId ?? gov.spans.triage,
      spanLabel: input.spanLabel,
    },
  );
}

export async function recordTicketDataRead(
  gov: Governance,
  input: { fields: string[]; parentEventId?: string },
): Promise<string> {
  return recordDataAccess(
    gov.recordCtx,
    {
      operation: "read",
      resource: "support_ticket",
      fields: input.fields,
      classification: "pii_financial",
      parentEventId: input.parentEventId,
    },
    {
      sign: gov.sign,
      ingest: gov.ingest,
      spanId: gov.spans.session,
      spanLabel: "Ticket intake",
    },
  );
}

export async function recordAgentDecision(
  gov: Governance,
  input: {
    decision: string;
    rationale: string;
    parentEventId?: string;
    spanId?: string;
  },
): Promise<string> {
  return recordDecision(
    gov.recordCtx,
    {
      decision: input.decision,
      rationale: input.rationale,
      parentEventId: input.parentEventId,
    },
    {
      sign: gov.sign,
      ingest: gov.ingest,
      spanId: input.spanId ?? gov.spans.triage,
      spanLabel: "Agent decision",
    },
  );
}

export async function recordTraceProvenanceClaim(
  gov: Governance,
  input: { claim: string; authority: string; subjectEventId?: string },
): Promise<string> {
  return recordProvenanceClaim(
    gov.recordCtx,
    {
      claim: input.claim,
      authority: input.authority,
      subjectEventId: input.subjectEventId,
      businessContext: "End-of-trace signed assertion for auditors",
    },
    {
      sign: gov.sign,
      ingest: gov.ingest,
      spanId: gov.spans.session,
      spanLabel: "Provenance claim",
    },
  );
}

export async function attemptPaymentTool(
  gov: Governance,
  input: {
    amountUsd: number;
    customerEmail: string;
    orderId: string;
    upstreamUrl: string;
    triggerSource?: string;
    triggerReason?: string;
  },
): Promise<"denied" | "allowed"> {
  try {
    await wrapFetch(
      input.upstreamUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_usd: input.amountUsd,
          customer_email: input.customerEmail,
          order_id: input.orderId,
        }),
      },
      {
        context: {
          organizationId: gov.config.organizationId,
          agentId: gov.config.agentId,
          keyId: gov.config.keyId,
          traceId: gov.traceId,
          toolName: "stripe.paymentIntents.create",
          actorPrincipal: gov.config.actorPrincipal,
          spanId: gov.spans.payment,
          spanLabel: "Payment tool",
          auditPayload: {
            provider: "stripe",
            action: "create_payment_intent",
            amount_usd: input.amountUsd,
            currency: "USD",
            resource_id: input.orderId,
            trigger_source: input.triggerSource ?? "support_ai_agent",
            trigger_detail:
              input.triggerReason ??
              "Customer requested refund; agent attempted autonomous payment without human approval",
            business_context: `Refund $${input.amountUsd} for order ${input.orderId} (${input.customerEmail})`,
            risk_if_unmonitored:
              "Unmonitored AI could double-refund, pay wrong customer, or bypass finance controls.",
            investor_summary:
              "Support AI tried to move money after reading a ticket. Aegis blocked the payment tool and recorded why.",
          },
        },
        sign: gov.sign,
        ingest: gov.ingest,
      },
    );
    return "allowed";
  } catch (err) {
    if (err instanceof PolicyDeniedError) {
      return "denied";
    }
    throw err;
  }
}
