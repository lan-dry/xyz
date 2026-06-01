import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aegis } from "@salanor/aegis-ledger-sdk";

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

const dir = mkdtempSync(join(tmpdir(), "salanor-aegis-demo-"));
const storePath = join(dir, "events.ndjson");

console.log("Aegis P0 local demo");
console.log(`Ledger: ${storePath}\n`);

for (let i = 0; i < scenarios.length; i++) {
  const { event } = aegis.record(
    storePath,
    {
      tenant_id: "local-demo",
      actor: { id: "agent:rules-engine", type: "software_agent" },
      action: "decision.record",
      ...scenarios[i]!,
    },
    { recorded_at: DEMO_CLOCK[i], event_id: DEMO_IDS[i] },
  );
  console.log(`[record] ${event.event_id} → ${event.chain.event_hash.slice(0, 20)}…`);
}

const verification = aegis.verify(storePath);
console.log(`\n[verify] ok=${verification.ok} events=${verification.event_count}`);

const replayed = aegis.replay(storePath, "tier-a-demo");
console.log(`[replay] steps=${replayed.steps.length} digest=${replayed.digest}`);
console.log("\nTier-A reconstruction (deterministic):");
for (const step of replayed.steps) {
  console.log(
    `  • ${step.subject.id}: ${String(step.reconstructed.outcome.decision)} (inputs=${JSON.stringify(step.reconstructed.inputs)})`,
  );
}

rmSync(dir, { recursive: true, force: true });
console.log("\nDone. Re-run `pnpm aegis:demo` — digest should match across runs.");
