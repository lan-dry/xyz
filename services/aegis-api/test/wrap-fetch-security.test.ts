import {
  PolicyDeniedError,
  PolicyEvaluationUnavailableError,
  wrapFetch,
  type IngestResult,
} from "@salanor/aegis";
import { describe, expect, it, vi } from "vitest";

const baseConfig = {
  context: {
    organizationId: "11111111-1111-4111-8111-111111111111",
    agentId: "agent-support-refund",
    keyId: "key-support-refund",
    traceId: "trc_111111111111111111111111",
    toolName: "payments.refund.create",
  },
  sign: {
    privateKeyB64: "not-used-by-mocked-ingest",
    keyId: "key-support-refund",
  },
  ingest: {
    apiBaseUrl: "http://aegis.test",
    ingestApiKey: "test-key",
  },
};

describe("wrapFetch security boundary", () => {
  it("fails closed and never calls the upstream tool when policy evaluation is unavailable", async () => {
    const upstream = vi.fn<typeof fetch>();

    await expect(
      wrapFetch("https://payments.test/refund", { method: "POST" }, {
        ...baseConfig,
        fetchImpl: upstream,
        evaluatePolicyFn: async () => {
          throw new Error("policy service offline");
        },
      }),
    ).rejects.toBeInstanceOf(PolicyEvaluationUnavailableError);

    expect(upstream).not.toHaveBeenCalled();
  });

  it("passes contextual payload to policy evaluation before denying the tool", async () => {
    const upstream = vi.fn<typeof fetch>();
    const evaluate = vi.fn(async () => ({
      decision: "deny" as const,
      policy_id: "pol_retail_refunds",
      rule_id: "rule_retail_refund_limit",
      reason: "retail refund exceeds contextual limit",
    }));
    const ingestFn = vi.fn(async (): Promise<IngestResult> => ({
      event_id: "evt_111111111111111111111111",
      status: "created",
      event_hash: "hash",
      sequence_num: 1,
    }));
    const policyPayload = {
      amount_usd: 249,
      segment: "retail",
      account_type: "consumer",
      beneficiary: "customer_4410",
    };

    await expect(
      wrapFetch("https://payments.test/refund", { method: "POST" }, {
        ...baseConfig,
        context: {
          ...baseConfig.context,
          policyPayload,
        },
        fetchImpl: upstream,
        evaluatePolicyFn: evaluate,
        ingestFn,
      }),
    ).rejects.toBeInstanceOf(PolicyDeniedError);

    expect(evaluate).toHaveBeenCalledWith({
      organization_id: baseConfig.context.organizationId,
      agent_id: baseConfig.context.agentId,
      tool_name: baseConfig.context.toolName,
      payload: policyPayload,
    });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("fail_open_buffer allows the upstream tool when policy evaluation is unavailable", async () => {
    const upstream = vi.fn<typeof fetch>(async () => new Response("ok", { status: 200 }));
    const ingestFn = vi.fn(async (): Promise<IngestResult> => ({
      event_id: "evt_buffered_parent_00000001",
      status: "created",
      event_hash: "hash",
      sequence_num: 1,
    }));

    const response = await wrapFetch(
      "https://payments.test/refund",
      { method: "POST" },
      {
        ...baseConfig,
        failMode: "fail_open_buffer",
        fetchImpl: upstream,
        evaluatePolicyFn: async () => {
          throw new Error("policy service offline");
        },
        ingestFn,
      },
    );

    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledOnce();
    expect(ingestFn).toHaveBeenCalled();
  });
});

