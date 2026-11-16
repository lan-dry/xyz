/**
 * P9 load-test script. Prints p50/p95/p99 only from measured samples.
 * Do not publish latency figures that were not produced by this script.
 *
 * Usage:
 *   pnpm tsx tools/bench/load-test.mts
 *   AEGIS_API_BASE=... AEGIS_INGEST_KEY=... BENCH_N=1000 BENCH_CONCURRENCY=20 pnpm tsx tools/bench/load-test.mts
 *
 * Reports two series:
 *   - sdk_overhead: POST /health (network + JSON parse only)
 *   - full_decision: POST /v1/aegis/bank/events (governed decision path)
 */
import { cpus, totalmem } from "node:os";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Load repo .env so AEGIS_INGEST_DEV_KEY works without manual export.
{
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const envPath = resolve(root, ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (k && process.env[k] === undefined) process.env[k] = v;
    }
  }
}

const base = process.env.AEGIS_API_BASE ?? "http://localhost:8080";
const key =
  process.env.AEGIS_INGEST_KEY?.trim() ||
  process.env.AEGIS_INGEST_DEV_KEY?.trim();
const n = Number(process.env.BENCH_N ?? "1000");
const concurrency = Math.max(1, Number(process.env.BENCH_CONCURRENCY ?? "20"));

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1,
  );
  return sorted[idx]!;
}

function summarize(label: string, samples: number[], errors: number) {
  const sorted = [...samples].sort((a, b) => a - b);
  const totalMs = sorted.reduce((a, b) => a + b, 0);
  return {
    label,
    n: samples.length,
    concurrency,
    errors,
    p50_ms: Number(percentile(sorted, 50).toFixed(2)),
    p95_ms: Number(percentile(sorted, 95).toFixed(2)),
    p99_ms: Number(percentile(sorted, 99).toFixed(2)),
    mean_ms: Number((totalMs / Math.max(1, sorted.length)).toFixed(2)),
    wall_throughput_rps: Number(
      ((samples.length / Math.max(1, totalMs / concurrency)) * 1000).toFixed(2),
    ),
  };
}

async function mapPool<T>(
  count: number,
  limit: number,
  fn: (i: number) => Promise<T>,
): Promise<T[]> {
  const out: T[] = new Array(count);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= count) return;
      out[i] = await fn(i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, count) }, () => worker()),
  );
  return out;
}

async function main() {
  console.log("machine", {
    cpus: cpus().length,
    ram_gb: Math.round(totalmem() / 1e9),
    node: process.version,
    platform: process.platform,
  });
  console.log("bench_config", { base, n, concurrency });

  if (!key) {
    console.log(
      "SKIP: set AEGIS_INGEST_KEY to measure bank event latency against a running server.",
    );
    console.log("No latency figure is published without a measured run.");
    process.exit(0);
  }

  // --- Transport / JSON overhead (401 auth fail — no DB decision work) ---
  const sdkSamples: number[] = [];
  let sdkErrors = 0;
  const sdkWallStart = performance.now();
  await mapPool(n, concurrency, async () => {
    const started = performance.now();
    try {
      const res = await fetch(`${base}/v1/aegis/bank/events`, {
        method: "POST",
        headers: {
          Authorization: "Bearer invalid_bench_overhead_key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ schema_version: 1 }),
      });
      // Transport probe: any HTTP response counts (401/422/429); only network failures error.
      await res.text();
    } catch {
      sdkErrors++;
    }
    sdkSamples.push(performance.now() - started);
  });
  const sdkWallMs = performance.now() - sdkWallStart;

  // --- Full decision path ---
  const decisionSamples: number[] = [];
  let decisionErrors = 0;
  const decisionWallStart = performance.now();
  await mapPool(n, concurrency, async (i) => {
    const started = performance.now();
    const idem = `bench-${Date.now()}-${i}-${Math.random().toString(16).slice(2, 8)}`;
    try {
      const res = await fetch(`${base}/v1/aegis/bank/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idem,
        },
        body: JSON.stringify({
          schema_version: 1,
          case_id: `bench-${i}-${idem.slice(-8)}`,
          idempotency_key: idem,
          event_type: "loan_decision",
          product: "retail_loan",
          emitted_at: new Date().toISOString(),
          attributes: { amount: 3_000_000, currency: "RWF" },
        }),
      });
      if (!res.ok) decisionErrors++;
      await res.text();
    } catch {
      decisionErrors++;
    }
    decisionSamples.push(performance.now() - started);
  });
  const decisionWallMs = performance.now() - decisionWallStart;

  const sdk = summarize("transport_auth_reject", sdkSamples, sdkErrors);
  const full = summarize("full_decision_bank_events", decisionSamples, decisionErrors);
  const sdkP50 = sdk.p50_ms;
  const fullP50 = full.p50_ms;

  console.log({
    ...sdk,
    wall_ms: Number(sdkWallMs.toFixed(2)),
    observed_rps: Number(((n / sdkWallMs) * 1000).toFixed(2)),
    data_size: "POST /v1/aegis/bank/events with invalid Bearer (expect 401)",
  });
  console.log({
    ...full,
    wall_ms: Number(decisionWallMs.toFixed(2)),
    observed_rps: Number(((n / decisionWallMs) * 1000).toFixed(2)),
    data_size: "single synthetic loan_decision ~0.5KB body",
  });
  console.log({
    label: "delta_full_minus_transport_p50_ms",
    p50_delta_ms: Number((fullP50 - sdkP50).toFixed(2)),
    note: "Approximate full-decision excess over auth-reject transport overhead; not a published SLA.",
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
