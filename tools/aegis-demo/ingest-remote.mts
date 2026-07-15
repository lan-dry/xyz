import "./load-root-env.mts";
import { aegis } from "@salanor/aegis-ledger-sdk";

const baseUrl = process.env.AEGIS_INGEST_BASE_URL?.trim() || "http://localhost:3000";
const apiKey = process.env.AEGIS_INGEST_DEV_KEY?.trim();

if (!apiKey) {
  console.error(
    "Set AEGIS_INGEST_DEV_KEY in repo root .env (see .env.example) before running ingest demo.",
  );
  process.exit(1);
}

const traceId = "66666666-6666-4666-8666-666666666601";
const eventId = "77777777-7777-4777-8777-777777777701";

console.log("Aegis P2 remote ingest demo");
console.log(`POST ${baseUrl}/api/aegis/ingest`);
console.log(`Ingest key: set (${apiKey.length} chars, prefix ${apiKey.slice(0, 4)}…)\n`);
console.log(
  "Tip: events appear under the org tied to the API key (AEGIS_INGEST_DEV_KEY → dev org).",
);
console.log(
  "If ingest returns pipeline=bus, run `pnpm aegis:ledger-writer` or set AEGIS_INGEST_MODE=direct.\n",
);

try {
  const result = await aegis.recordCloud(
    {
      tenant_id: "p2-ingest-demo",
      actor: { id: "agent:rules-engine", type: "software_agent" },
      action: "decision.record",
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
      baseUrl,
      apiKey,
      traceId,
      event_id: eventId,
      recorded_at: "2026-05-16T12:00:00.000Z",
      idempotencyKey: `demo-${eventId}`,
    },
  );

  console.log(`[ingest] event_id=${result.event_id} trace_id=${result.trace_id}`);
  console.log(`[chain]  ${result.event.chain.event_hash.slice(0, 24)}…`);
  console.log("\nDone. Re-run with dev server up; idempotency key returns same ids.");
} catch (err) {
  console.error("[ingest] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
