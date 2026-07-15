import { describe, expect, it } from "vitest";
import { computeChainRootHash } from "../src/trace/chain-root.js";
import { buildProvenanceClaim } from "../src/trace/provenance-claim.js";

describe("computeChainRootHash", () => {
  it("is deterministic for the same trace anchor inputs", () => {
    const input = {
      traceId: "trc_abc",
      agentId: "agt_01",
      startedAt: "2026-05-18T12:00:00.000Z",
    };
    expect(computeChainRootHash(input)).toBe(computeChainRootHash(input));
    expect(computeChainRootHash(input)).toHaveLength(64);
  });
});

describe("buildProvenanceClaim", () => {
  it("includes agent, policy outcome, and authority", () => {
    const { claim, authority } = buildProvenanceClaim({
      agentId: "agt_payments",
      actorType: "agent",
      actorPrincipal: "payments-bot",
      actionKind: "tool_call",
      policyDecision: "deny",
      toolName: "stripe.paymentIntents.create",
      policyId: "pol_default",
      emittedAt: "2026-05-18T14:32:11.123Z",
      payload: { action: "create_payment_intent" },
    });
    expect(authority).toBe("policy:pol_default");
    expect(claim).toContain("agt_payments");
    expect(claim).toContain("deny");
    expect(claim).toContain("stripe.paymentIntents.create");
  });
});
