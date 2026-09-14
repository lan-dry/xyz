import { describe, expect, it } from "vitest";
import { enrichProvenancePayload } from "../src/ingest/enrich-payload.js";

describe("enrichProvenancePayload", () => {
  it("infers provider and action from tool_name", () => {
    const out = enrichProvenancePayload({
      payload: { amount_usd: 100 },
      toolName: "stripe.paymentIntents.create",
      actionKind: "tool_call",
      policyId: "pol_1",
    });
    expect(out.provider).toBe("stripe");
    expect(out.action).toBe("paymentIntents.create");
    expect(out.authority).toBe("policy:pol_1");
    expect(out.currency).toBe("USD");
  });
});
