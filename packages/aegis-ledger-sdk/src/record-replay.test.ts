import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { record } from "./record.js";
import { replay } from "./replay.js";
import { verify } from "./verify.js";
import { readEvents } from "./store.js";

const DEMO_CLOCK = [
  "2026-05-16T12:00:00.000Z",
  "2026-05-16T12:00:01.000Z",
  "2026-05-16T12:00:02.000Z",
] as const;

const DEMO_IDS = [
  "11111111-1111-4111-8111-111111111101",
  "11111111-1111-4111-8111-111111111102",
  "11111111-1111-4111-8111-111111111103",
] as const;

function runDeterministicDemo(storePath: string) {
  const scenarios = [
    {
      subject: { type: "workflow_step", id: "credit-approval" },
      context: {
        inputs: { amount_usd: 12000, credit_score: 710 },
        model: { id: "rules-v1", version: "1.0.0" },
        policy: { id: "credit-policy", version: "2026-01" },
        evidence: [],
        outcome: { decision: "approve", confidence: 0.92 },
      },
    },
    {
      subject: { type: "workflow_step", id: "credit-approval" },
      context: {
        inputs: { amount_usd: 45000, credit_score: 640 },
        model: { id: "rules-v1", version: "1.0.0" },
        policy: { id: "credit-policy", version: "2026-01" },
        evidence: [],
        outcome: { decision: "review", confidence: 0.61 },
      },
    },
    {
      subject: { type: "workflow_step", id: "fraud-screen" },
      context: {
        inputs: { velocity_24h: 9 },
        model: { id: "fraud-heuristics", version: "2.1.0" },
        policy: { id: "fraud-policy", version: "2026-02" },
        evidence: [{ ref: "device:fingerprint-x" }],
        outcome: { decision: "deny", confidence: 0.88 },
      },
    },
  ] as const;

  for (let i = 0; i < scenarios.length; i++) {
    record(
      storePath,
      {
        tenant_id: "local-demo",
        actor: { id: "agent:rules-engine", type: "software_agent" },
        action: "decision.record",
        ...scenarios[i]!,
      },
      { recorded_at: DEMO_CLOCK[i], event_id: DEMO_IDS[i] },
    );
  }

  return replay(storePath, "tier-a-demo");
}

describe("record → replay → verify", () => {
  it("produces identical replay digests across runs", () => {
    const digests: string[] = [];
    for (let run = 0; run < 3; run++) {
      const dir = mkdtempSync(join(tmpdir(), "aegis-test-"));
      const storePath = join(dir, "events.ndjson");
      digests.push(runDeterministicDemo(storePath).digest);
      expect(verify(storePath).ok).toBe(true);
      expect(readEvents(storePath)).toHaveLength(3);
      rmSync(dir, { recursive: true, force: true });
    }
    expect(new Set(digests).size).toBe(1);
  });
});
