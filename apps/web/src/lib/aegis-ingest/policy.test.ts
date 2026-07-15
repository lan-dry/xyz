import { describe, expect, it } from "vitest";

import type { ApsEvent } from "@salanor/aegis-ledger-sdk";

import { evaluatePolicy, parsePolicyRules } from "./policy";

const BASE_EVENT: ApsEvent = {
  aps_version: "0.1",
  event_id: "22222222-2222-4222-8222-222222222201",
  recorded_at: "2026-05-16T12:00:00.000Z",
  actor: { id: "agent:test", type: "software_agent" },
  action: "decision.record",
  subject: { type: "workflow_step", id: "step-1" },
  context: {
    inputs: { amount: 100 },
    outcome: { decision: "approve" },
  },
  signature: {
    alg: "local-placeholder",
    value: "placeholder:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  },
  chain: {
    prev_event_hash: null,
    event_hash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  },
};

describe("policy rules parser", () => {
  it("accepts valid v1 rules", () => {
    const parsed = parsePolicyRules({
      version: "1",
      require_fields: ["actor.id", "context.outcome"],
      deny_if_missing_actor: true,
      max_payload_bytes: 1000,
    });
    expect(parsed).not.toBeNull();
  });

  it("rejects unsupported rules schema", () => {
    const parsed = parsePolicyRules({
      version: "2",
      max_payload_bytes: 1000,
    });
    expect(parsed).toBeNull();
  });

  it("rejects malformed require_fields", () => {
    const parsed = parsePolicyRules({
      version: "1",
      require_fields: ["actor.id", 42],
    });
    expect(parsed).toBeNull();
  });
});

describe("evaluatePolicy", () => {
  it("allows event that satisfies all rules", () => {
    const result = evaluatePolicy(BASE_EVENT, {
      version: "1",
      deny_if_missing_actor: true,
      require_fields: ["actor.id", "actor.type", "context.inputs", "context.outcome"],
      max_payload_bytes: 10000,
    });
    expect(result.allow).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("denies when required fields are missing", () => {
    const event: ApsEvent = {
      ...BASE_EVENT,
      context: {
        ...BASE_EVENT.context,
        outcome: {} as Record<string, unknown>,
      },
    };
    const result = evaluatePolicy(event, {
      version: "1",
      require_fields: ["context.outcome.decision"],
    });
    expect(result.allow).toBe(false);
    expect(result.violations[0]).toContain("context.outcome.decision");
  });

  it("denies when payload exceeds byte limit", () => {
    const result = evaluatePolicy(BASE_EVENT, {
      version: "1",
      max_payload_bytes: 50,
    });
    expect(result.allow).toBe(false);
    expect(result.violations[0]).toContain("max_payload_bytes");
  });
});
