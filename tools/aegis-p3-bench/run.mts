import "../aegis-demo/load-root-env.mts";

import { aegis, AegisRemoteError } from "@salanor/aegis-ledger-sdk";

const baseUrl = process.env.AEGIS_INGEST_BASE_URL?.trim() || "http://localhost:3000";
const apiKey = process.env.AEGIS_INGEST_DEV_KEY?.trim();
function benchCount(): number {
  const argv = process.argv.slice(2);
  const flagIdx = argv.findIndex((a) => a === "--count" || a.startsWith("--count="));
  if (flagIdx >= 0) {
    const token = argv[flagIdx]!;
    if (token.includes("=")) {
      return Number(token.split("=")[1]);
    }
    const next = argv[flagIdx + 1];
    if (next) {
      return Number(next);
    }
  }
  return Number(process.env.AEGIS_P3_BENCH_COUNT ?? "100");
}

const count = benchCount();

if (!apiKey) {
  console.error("Set AEGIS_INGEST_DEV_KEY in .env before running P3 bench.");
  process.exit(1);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

async function main(): Promise<void> {
  console.log(`Aegis P3 bench — ${count} ingest publishes\n`);

  const latenciesMs: number[] = [];
  const traceBase = `bench-${Date.now()}`;
  const started = performance.now();

  for (let i = 0; i < count; i++) {
    const t0 = performance.now();
    await aegis.recordCloud(
      {
        tenant_id: "p3-bench",
        actor: { id: "agent:p3-bench", type: "software_agent" },
        action: "decision.record",
        subject: { type: "workflow_step", id: `bench-${i}` },
        context: {
          inputs: { index: i },
          outcome: { decision: "approve", confidence: 0.5 },
        },
      },
      {
        baseUrl,
        apiKey,
        traceId: `${traceBase}-${i % 16}`,
        idempotencyKey: `p3-bench-${traceBase}-${i}`,
      },
    );
    latenciesMs.push(performance.now() - t0);
  }

  const elapsedSec = (performance.now() - started) / 1000;
  const sorted = [...latenciesMs].sort((a, b) => a - b);
  const evtPerSec = count / elapsedSec;

  console.log(`events:     ${count}`);
  console.log(`elapsed:    ${elapsedSec.toFixed(2)} s`);
  console.log(`throughput: ${evtPerSec.toFixed(1)} evt/s (ingest HTTP ack only)`);
  console.log(`latency p50: ${percentile(sorted, 50).toFixed(1)} ms`);
  console.log(`latency p99: ${percentile(sorted, 99).toFixed(1)} ms`);
  console.log("\nNote: ledger flush latency is not included; see docs/AEGIS_P3_PERF.md.");
}

main().catch((err) => {
  if (err instanceof AegisRemoteError) {
    console.error(`[bench] ingest failed (${err.status}): ${err.message}`);
  } else {
    console.error("[bench] failed:", err instanceof Error ? err.message : err);
  }
  process.exit(1);
});
