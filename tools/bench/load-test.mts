/**
 * P9 load-test script. Prints p50/p95/p99 only from measured samples.
 * Do not publish latency figures that were not produced by this script.
 *
 * Usage:
 *   pnpm tsx tools/bench/load-test.mts
 *   AEGIS_API_BASE=... AEGIS_INGEST_KEY=... pnpm tsx tools/bench/load-test.mts
 */
import { cpus, totalmem } from "node:os";

const base = process.env.AEGIS_API_BASE ?? "http://localhost:8080";
const key = process.env.AEGIS_INGEST_KEY;
const n = Number(process.env.BENCH_N ?? "50");

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx]!;
}

async function main() {
  console.log("machine", {
    cpus: cpus().length,
    ram_gb: Math.round(totalmem() / 1e9),
    node: process.version,
    platform: process.platform,
  });

  if (!key) {
    console.log(
      "SKIP: set AEGIS_INGEST_KEY to measure bank event latency against a running server.",
    );
    console.log("No latency figure is published without a measured run.");
    process.exit(0);
  }

  const samples: number[] = [];
  let errors = 0;
  for (let i = 0; i < n; i++) {
    const started = performance.now();
    try {
      const res = await fetch(`${base}/v1/aegis/bank/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `bench-${Date.now()}-${i}`,
        },
        body: JSON.stringify({
          schema_version: 1,
          case_id: `bench-${i}`,
          idempotency_key: `bench-${Date.now()}-${i}`,
          event_type: "loan_decision",
          product: "retail_loan",
          emitted_at: new Date().toISOString(),
          attributes: { amount: 3_000_000, currency: "RWF" },
        }),
      });
      if (!res.ok) errors++;
    } catch {
      errors++;
    }
    samples.push(performance.now() - started);
  }

  samples.sort((a, b) => a - b);
  const totalMs = samples.reduce((a, b) => a + b, 0);
  console.log({
    n,
    errors,
    p50_ms: Number(percentile(samples, 50).toFixed(2)),
    p95_ms: Number(percentile(samples, 95).toFixed(2)),
    p99_ms: Number(percentile(samples, 99).toFixed(2)),
    throughput_rps: Number(((n / totalMs) * 1000).toFixed(2)),
    data_size: "single synthetic loan_decision ~0.5KB body",
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
