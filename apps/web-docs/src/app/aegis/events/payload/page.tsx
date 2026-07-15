import type { Metadata } from "next";

import { ParamTable } from "@/components/api-reference";
import { CodeBlock } from "@/components/code-block";

export const metadata: Metadata = { title: "Payload conventions" };

export default function EventPayloadPage() {
  return (
    <>
      <h1>Payload conventions</h1>
      <p className="lead">
        Structured <code>payload</code> fields power console provenance, policy conditions, and
        compliance exports. Populate them consistently across LLM and tool events.
      </p>

      <h2>Recommended fields</h2>
      <ParamTable
        rows={[
          { name: "purpose", type: "string", description: "Why this LLM/tool step ran" },
          { name: "data_touched", type: "string[]", description: "Logical fields sent to the model or tool" },
          { name: "data_classification", type: "string", description: "e.g. pii, pii_financial, internal" },
          { name: "provider", type: "string", description: "Vendor: stripe, openai, google" },
          { name: "action", type: "string", description: "Human-readable action name" },
          { name: "amount_usd", type: "number", description: "For financial policy limits" },
          { name: "currency", type: "string", description: "ISO currency, default USD" },
          { name: "trigger_source", type: "string", description: "Upstream system (ticket, calendar, CRM)" },
          { name: "trigger_reason", type: "string", description: "Plain-language cause" },
          { name: "business_context", type: "string", description: "Executive audit line" },
          { name: "investor_summary", type: "string", description: "One-sentence narrative for dashboards" },
          { name: "transaction_id", type: "string", description: "Vendor correlation id" },
        ].map((r) => ({ ...r, type: r.type, required: false, description: r.description }))}
      />

      <h2>LLM invocation example</h2>
      <CodeBlock
        lang="json"
        code={`{
  "purpose": "triage_support_ticket",
  "data_touched": ["customer_email", "order_id", "ticket_message"],
  "data_classification": "pii_financial",
  "prompt_hash": "a1b2c3…",
  "response_hash": "d4e5f6…"
}`}
      />

      <h2>Policy / payment example</h2>
      <CodeBlock
        lang="json"
        code={`{
  "provider": "stripe",
  "action": "create_payment_intent",
  "amount_usd": 249,
  "currency": "USD",
  "trigger_source": "support_ai_agent",
  "trigger_reason": "Customer refund request on TKT-8842",
  "resource_id": "ORD-2026-4410"
}`}
      />

      <h2>Policy conditions</h2>
      <p>
        Rules can use <code>max_per_tx</code> and <code>max_daily_total</code> when{" "}
        <code>amount_usd</code> is present at evaluate/ingest time.
      </p>
    </>
  );
}
