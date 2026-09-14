# Aegis P3 — performance harness (MVP acceptance)

## MVP acceptance (engineering)

Phase 3 **closes item 12** with:

- `pnpm aegis:p3-bench` — reproducible ingest throughput and client-side latency sample
- Documented gaps vs PDF targets (5k evt/s sustained, p99 &lt; 1.5ms hot path)
- **No CI gate** on throughput or sub-millisecond latency — collector remains TypeScript HTTP ingest, not Rust edge

Full PDF parity on hot-path latency and sustained 5k evt/s is explicitly **post-P3 (P3.5)** when a Rust edge collector and scaled ingest replicas exist.

---

## `pnpm aegis:p3-bench`

Publishes **N** events (default **100**) through the HTTP ingest path and reports:

- Throughput (evt/s) — time to receive **201** after JetStream publish ack (bus mode)
- Ingest latency p50 / p99 (client-side, HTTP round-trip)

This measures the **ingest hot path** only. Ledger flush, Merkle batching, and anchor submission are asynchronous.

### Event count

```powershell
# env
$env:AEGIS_P3_BENCH_COUNT="5000"
pnpm aegis:p3-bench

# CLI flag (same harness)
pnpm aegis:p3-bench --count 5000
```

Large counts (e.g. 5000) may take minutes on a laptop — that is expected; do not fail CI on duration.

---

## Targets vs harness

| Metric | MVP PDF target | P3 harness | MVP status |
|--------|----------------|------------|------------|
| Sustained throughput | ~5k evt/s | Reports actual evt/s on your machine | **Gap documented** — not CI gate |
| Hot path p99 | &lt; 1.5ms | HTTP round-trip p99 (includes network stack) | **Not comparable** — Rust edge deferred |
| Regression detection | — | Compare bench output across commits locally | **Done** |

Use results to compare regressions locally. Full 5k evt/s sustained load requires dedicated infra (multiple ingest replicas, NATS tuning, writer scaling) — tracked for P3.5.

---

## Suggested local run

```powershell
$env:AEGIS_P3_BENCH_COUNT="500"
pnpm aegis:p3-bench
```

Prerequisites: `pnpm dev`, `pnpm aegis:ledger-writer`, NATS + Postgres configured like `pnpm aegis:p3-smoke`.
