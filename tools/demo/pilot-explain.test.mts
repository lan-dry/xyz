import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildInvestorSummary, buildLlmExplainPayload } from "../../apps/pilot-agent/src/explain.ts";

describe("pilot trace explain fields (AI behaviour in console)", () => {
  it("investor_summary documents what the model saw and why", () => {
    const payload = buildLlmExplainPayload({
      purpose: "triage_support_ticket",
      dataTouched: ["customer_email", "order_id", "ticket_message", "refund_amount_usd"],
      businessContext: "Triage ticket TKT-8842: customer asks for 249 refund",
      riskIfUnmonitored:
        "Without a ledger you cannot prove which PII the model saw or who approved money movement.",
      triggerSource: "support_ticket",
      triggerDetail: "TKT-8842",
    });

    assert.match(payload.investor_summary, /TKT-8842/);
    assert.match(payload.investor_summary, /customer_email/);
    assert.match(payload.risk_if_unmonitored ?? "", /PII/);
    assert.ok(payload.data_touched.includes("refund_amount_usd"));
  });

  it("purpose fallback when no business context", () => {
    assert.equal(
      buildInvestorSummary({
        purpose: "human_handoff_summary",
        dataTouched: ["ticket_message", "order_id"],
      }),
      'AI step "human_handoff_summary" on ticket_message, order_id.',
    );
  });
});
