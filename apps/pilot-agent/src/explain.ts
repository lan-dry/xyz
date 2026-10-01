/** Human-readable fields stored on ingested events (console “why this matters”). */

export type LlmExplainInput = {
  purpose: string;
  dataTouched: string[];
  businessContext?: string;
  riskIfUnmonitored?: string;
  triggerSource?: string;
  triggerDetail?: string;
};

export function buildInvestorSummary(input: LlmExplainInput): string {
  if (input.businessContext) {
    return `${input.businessContext} Data touched: ${input.dataTouched.join(", ")}.`;
  }
  return `AI step "${input.purpose}" on ${input.dataTouched.join(", ")}.`;
}

export function buildLlmExplainPayload(input: LlmExplainInput): {
  investor_summary: string;
  trigger_source: string;
  trigger_detail?: string;
  business_context?: string;
  risk_if_unmonitored?: string;
  data_touched: string[];
} {
  return {
    investor_summary: buildInvestorSummary(input),
    trigger_source: input.triggerSource ?? "support_ticket",
    trigger_detail: input.triggerDetail,
    business_context: input.businessContext,
    risk_if_unmonitored: input.riskIfUnmonitored,
    data_touched: input.dataTouched,
  };
}

export const CONSOLE_ENV_GUIDE = [
  "AEGIS_INGEST_API_KEY — API keys page, create key, copy secret (once).",
  "AEGIS_ORGANIZATION_ID — Settings → Organization.",
  "AEGIS_AGENT_ID, AEGIS_KEY_ID, AEGIS_SIGNING_PRIVATE_KEY_B64 — Agents → Create agent → credentials JSON (once).",
] as const;

export const PILOT_TRACE_READING_GUIDE = [
  "Each LLM step records investor_summary + data_touched — what the model saw and why the step ran.",
  "agent.decision events link model output to the next action (refund workflow).",
  "tool.invocation for stripe.paymentIntents.create shows allow/deny — policy blocked payment before money moved.",
] as const;
