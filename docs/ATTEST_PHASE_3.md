# Attest Phase 3 — Product MVP Backbone (PDF Parity Target)

> **Phase status: P3 COMPLETE (engineering)** — 2026-05-16

**Phase ID:** P3  
**Objective:** Satisfy **`Attest_Product_Specification.pdf` § MVP (12)** for managed + hybrid alpha readiness.

High-level components LIVE:

| # | Component |
|---|-----------|
|1| Edge Collector (TS ingest; Rust latency targets deferred to P3.5) |
|2| NATS JetStream bus |
|3| Ledger writer (Postgres index + blob store) |
|4| Anchor service (single OpenTimestamps) |
|5| Replay & export plane (Tier A+C) |

Architecture detail: **`docs/ATTEST_P3_ARCH.md`**.

---

## Acceptance criteria snapshots

| Check | Threshold | Status |
|-------|-----------|--------|
| Hot path latency | Approach p99 < 1.5ms MVP tolerance | **Out of scope (P3.5)** — see `docs/ATTEST_P3_PERF.md` |
| Throughput harness | Demo 5k evt/s sustained | **Done (MVP)** — `pnpm attest:p3-bench` reports actuals; not a CI gate |
| Export | Offline verify CLI verifies sample pack | **Done** — `pnpm attest:verify-pack` |
| E2E pipeline | Event → bus → ledger → anchor → replay → export | **Done** (`pnpm attest:p3-smoke`) |

---

## Exit checklist (engineering)

| # | Item | Status |
|---|------|--------|
| 1 | Docker Compose NATS JetStream (`-js`) | Done |
| 2 | `@salanor/attest-bus` publish/subscribe + stream config | Done |
| 3 | Ingest publishes to JetStream when bus enabled | Done |
| 4 | `attest-ledger-writer` consumer, ack after Postgres write | Done |
| 5 | `attest_ledger_batches` + stub anchor (`anchor_status=stub`) | Done |
| 6 | `pnpm attest:p3-smoke` replay + JSON export | Done |
| 7 | Unit tests (`attest-bus`, `attest-sdk-ts`, `attest-storage`) | Done |
| 8 | NATS integration test (opt-in `ATTEST_NATS_INTEGRATION=1`) | Done |
| 9 | OpenTimestamps anchor | **Done** — `OpenTimestampsAnchorProvider` + `ATTEST_ANCHOR_MODE=ots`; `pnpm attest:anchor-reconcile` promotes `pending` → `anchored` |
| 10 | Object storage blobs | **Done** — local FS + S3-compatible (`ATTEST_BLOB_STORE=s3`, R2/MinIO) |
| 11 | Rust collector / edge buffer | **Out of scope (documented)** — TS ingest for prototype; P3.5 |
| 12 | Load / latency acceptance harness | **Done (MVP acceptance)** — bench harness + documented gaps vs PDF targets |

---

## Anchor lifecycle (stub → pending → anchored)

| Step | `anchor_status` | How |
|------|-----------------|-----|
| Default / offline | `stub` | `ATTEST_ANCHOR_MODE=stub` or OTS calendar unreachable |
| Calendar submit | `pending` | `ATTEST_ANCHOR_MODE=ots`, blob store on, calendar HTTP OK |
| Bitcoin confirmed | `anchored` | `pnpm attest:anchor-reconcile` verifies/upgrades OTS proof |

---

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm attest:p3-smoke` | E2E ingest → ledger → export + inline verify |
| `pnpm attest:verify-pack <path>` | Offline export pack verification (FR-ATT-VERIFY-OSS) |
| `pnpm attest:p3-bench` | Ingest throughput / latency sample (`--count N` or `ATTEST_P3_BENCH_COUNT`) |
| `pnpm attest:anchor-reconcile` | Promote OTS `pending` batches to `anchored` when proof confirms |

---

## Scope OUT (explicit MVP omissions per PDF)

- Java/Rust client SDK wrappers beyond Go baseline if deferred  
- Multi-anchor  
- Cross-tenant analytics  
- Full air-gap self-host  
- Rust edge collector (P3.5)

---

## Dependencies

Successful P2 bridge patterns + hardened secrets.
