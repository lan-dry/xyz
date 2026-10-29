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
    expect(ctx.segment).toBe("vip");
    expect(ctx.account_type).toBe("corporate");
    expect(ctx.beneficiary).toBe("ACME Ltd");
  });

  it("matches when clause on segment", () => {
    expect(
      matchesPolicyWhen({ segment: "VIP" }, { segment: "vip", beneficiary: "x" }),
    ).toBe(true);
    expect(
      matchesPolicyWhen({ segment: "VIP" }, { segment: "standard", beneficiary: "x" }),
    ).toBe(false);
  });

  it("matches merchant age thresholds", () => {
    expect(
      matchesPolicyWhen({ merchant_age_days_lt: 30 }, { merchant_age_days: 12 }),
    ).toBe(true);
    expect(
      matchesPolicyWhen({ merchant_age_days_lt: 30 }, { merchant_age_days: 30 }),
    ).toBe(false);
    expect(
      matchesPolicyWhen({ merchant_age_days_lte: 30 }, { merchant_age_days: 30 }),
    ).toBe(true);
  });

  it("reads merchant_age_days from payload", () => {
    const ctx = payloadContextFromPayload({
      request_payload: {
        merchant_id: "merchant-4417",
        merchant_age_days: 12,
        amount_usd: 2500,
      },
    });
    expect(ctx.beneficiary).toBe("merchant-4417");
    expect(ctx.merchant_age_days).toBe(12);
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

  it("KYC tool rule only holds when risk_tier is high", async () => {
    const mockClient = {} as never;
    const rule: PolicyRuleInput = {
      rule_id: "rule_kyc_high_risk_hold",
      tool_pattern: "kyc.merchant.approve",
      decision: "allow_with_obligation",
      priority: 100,
      conditions: {
        rule_type: "tool",
        when: { risk_tier: "high" },
      },
    };

    const high = await evaluateRulesWithConditions(mockClient, "pol_kyc", [rule], {
      toolName: "kyc.merchant.approve",
      organizationId: "org",
      payload: { risk_tier: "high" },
    });
    expect(high.decision).toBe("allow_with_obligation");

    const low = await evaluateRulesWithConditions(mockClient, "pol_kyc", [rule], {
      toolName: "kyc.merchant.approve",
      organizationId: "org",
      payload: { risk_tier: "low" },
    });
    expect(low.decision).toBe("allow");
  });
});
