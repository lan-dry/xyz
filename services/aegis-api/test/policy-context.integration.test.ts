import { describe, expect, it } from "vitest";
import {
  matchesPolicyWhen,
  payloadContextFromPayload,
} from "../src/policy/payload-context.js";
import { evaluateRulesWithConditions } from "../src/policy/evaluate-conditions.js";
import type { PolicyRuleInput } from "../src/policy/evaluate-rules.js";

describe("payload-context", () => {
  it("reads segment and beneficiary from request_payload", () => {
    const ctx = payloadContextFromPayload({
      request_payload: {
        segment: "VIP",
        account_type: "corporate",
        recipient: "ACME Ltd",
        amount_usd: 5000,
      },
    });
    expect(ctx).toEqual({
      segment: "VIP",
      account_type: "corporate",
      beneficiary: "ACME Ltd",
    });
  });

  it("matches when clause on segment", () => {
    expect(
      matchesPolicyWhen({ segment: "VIP" }, { segment: "VIP", beneficiary: "x" }),
    ).toBe(true);
    expect(
      matchesPolicyWhen({ segment: "VIP" }, { segment: "retail", beneficiary: "x" }),
    ).toBe(false);
  });
});

describe("evaluateRulesWithConditions contextual", () => {
  const baseRule: PolicyRuleInput = {
    rule_id: "rule_1",
    policy_id: "pol_1",
    tool_pattern: "app.payments.*",
    decision: "allow_with_obligation",
    priority: 100,
    conditions: {
      rule_type: "max_per_tx",
      max_amount_usd: 1000,
      when: { segment: "VIP" },
    },
  };

  it("applies VIP limit only for VIP segment", async () => {
    const mockClient = {} as never;

    const vip = await evaluateRulesWithConditions(mockClient, "pol_1", [baseRule], {
      toolName: "app.payments.transfer",
      organizationId: "org",
      payload: {
        request_payload: { amount_usd: 2000, segment: "VIP" },
      },
    });
    expect(vip.decision).toBe("allow_with_obligation");

    const retail = await evaluateRulesWithConditions(mockClient, "pol_1", [baseRule], {
      toolName: "app.payments.transfer",
      organizationId: "org",
      payload: {
        request_payload: { amount_usd: 2000, segment: "retail" },
      },
    });
    expect(retail.decision).toBe("allow");
  });

  it("blocks listed beneficiary", async () => {
    const mockClient = {} as never;
    const rule: PolicyRuleInput = {
      ...baseRule,
      decision: "deny",
      conditions: {
        rule_type: "blocked_beneficiary",
        blocked_beneficiaries: ["BLOCKED_CO"],
      },
    };

    const hit = await evaluateRulesWithConditions(mockClient, "pol_1", [rule], {
      toolName: "app.payments.transfer",
      organizationId: "org",
      payload: { request_payload: { recipient: "BLOCKED_CO", amount_usd: 10 } },
    });
    expect(hit.decision).toBe("deny");

    const ok = await evaluateRulesWithConditions(mockClient, "pol_1", [rule], {
      toolName: "app.payments.transfer",
      organizationId: "org",
      payload: { request_payload: { recipient: "ACME", amount_usd: 10 } },
    });
    expect(ok.decision).toBe("allow");
  });
});
