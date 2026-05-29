# Attest P3 architecture (MVP backbone slice)

**Status:** P3 COMPLETE (engineering) — vertical path, blob store (local + S3), OTS anchor + reconcile, Tier A+C export verify, bench harness.

## Data flow

```
SDK recordCloud / POST /api/attest/ingest
        │
        ▼ (validate + API key; idempotency read from Postgres)
   JetStream publish  subject: attest.events.ingest
        │
        ▼
 attest-ledger-writer (durable consumer: attest-ledger-writer)
        │
        ├── Postgres attest_ingest_events (sole writer)
        │     └── payload_blob_key → blob store (local or S3)
        ├── attest_ledger_batches (Merkle root + anchor)
        │     └── ots_blob_key → blob store when OTS pending
        └── ack after durable write
        │
        ▼
 pnpm attest:anchor-reconcile  (optional; pending → anchored)
        │
        ▼
 replayEvents / buildEvidenceExportPack / verifyExportPack
        │
        ├── pnpm attest:p3-smoke
        ├── pnpm attest:verify-pack <export.json>
        └── pnpm attest:p3-bench
```

## Design decisions

| Topic | Choice |
|-------|--------|
| Postgres writer | **Ledger worker only** — ingest does not `create` rows when `NATS_URL` / `ATTEST_INGEST_MODE=bus` |
| Idempotency | Ingest reads `attest_ingest_events` by `idempotency_key`; worker dedupes on insert |
| Ingest HTTP 201 | Returned after **JetStream publish ack** (not after ledger flush) |
| Anchor (FR-ATT-ANCHOR-OTS) | `ATTEST_ANCHOR_MODE=stub` (default) or `ots` — calendar HTTP submit, `anchor_status` ∈ `stub` \| `pending` \| `anchored` |
| Anchor reconcile | `pnpm attest:anchor-reconcile` — upgrades OTS proof via calendar, detects Bitcoin attestation |
| Object storage (FR-ATT-LEDGER-OBJ) | `@salanor/attest-storage` — `local`, `s3` (R2/MinIO), or `none` |
| Offline verify (FR-ATT-VERIFY-OSS) | `verifyExportPack` in SDK + `pnpm attest:verify-pack` |
| Tier C witness (FR-ATT-REPLAY-TIER-C) | Export pack `witness` block — merkle_root, anchor_status, anchor_ref, event_count, generated_at; **verification without re-executing decision logic** |
| Direct Postgres fallback | `ATTEST_INGEST_MODE=direct` or unset `NATS_URL` — P2 sync path for local dev without bus |

## Tier C witness mode

Externals verify an export pack using `pnpm attest:verify-pack` or `verifyExportPack()`:

- **Tier A** — full event chain + deterministic replay digest
- **Tier C** — read-only `witness` block attests batch Merkle root and anchor metadata; no need to re-run decision engines

The witness block is auto-populated by `buildEvidenceExportPack` when an `anchor` is present.

## Packages / apps

| Path | Role |
|------|------|
| `packages/attest-bus` | JetStream, Merkle, anchor providers, OTS verify |
| `packages/attest-storage` | Pluggable blob store (local FS, S3-compatible) |
| `packages/attest-sdk-ts` | SDK, export pack, `verifyExportPack`, witness |
| `apps/attest-ledger-writer` | NATS consumer → Prisma ledger + batch anchor + blobs |
| `apps/web/.../ingest/route.ts` | Edge collector (TS); publishes when bus enabled |
| `tools/attest-p3-smoke` | End-to-end smoke |
| `tools/attest-verify-pack` | Offline export CLI |
| `tools/attest-p3-bench` | Ingest latency / throughput sample |
| `tools/attest-anchor-reconcile` | OTS pending → anchored promotion |

## Environment

See `.env.example`:

| Variable | Purpose |
|----------|---------|
| `NATS_URL`, `ATTEST_NATS_*`, `ATTEST_INGEST_MODE` | Bus ingest |
| `ATTEST_BLOB_STORE` | `none` (default), `local`, or `s3` |
| `ATTEST_BLOB_LOCAL_PATH` | Blob root (default `tmp/attest-blobs`) |
| `ATTEST_S3_ENDPOINT`, `ATTEST_S3_BUCKET`, `ATTEST_S3_ACCESS_KEY`, `ATTEST_S3_SECRET_KEY` | S3-compatible store (R2, MinIO) |
| `ATTEST_S3_REGION` | Optional region (default `auto` for R2) |
| `ATTEST_S3_FORCE_PATH_STYLE` | `1` for R2/MinIO path-style URLs |
| `ATTEST_ANCHOR_MODE` | `stub` or `ots` |
| `ATTEST_OTS_CALENDAR_URL` | Calendar base (default `https://a.pool.opentimestamps.org`) |
| `ATTEST_OTS_DISABLED` | `1` → skip calendar HTTP (CI / offline stub only) |
| `ATTEST_P3_BENCH_COUNT` | Bench event count (default 100); or `pnpm attest:p3-bench --count 5000` |
| `ATTEST_ANCHOR_RECONCILE_DRY_RUN` | `1` → reconcile logs only, no DB writes |
| `ATTEST_ANCHOR_RECONCILE_LIMIT` | Max pending batches per run (default 50) |

## Blob paths

| Key pattern | Content |
|-------------|---------|
| `{sha256}` | Canonical JSON event payload (content-addressed) |
| `ots/{merkleRoot}.ots` | OpenTimestamps calendar proof bytes (pending anchor) |

## Deferred (P3.5 / P4+)

- Rust collector, disk buffer (FR-ATT-COLLECT-BUF)
- Hot path p99 &lt; 1.5ms measurement (Rust edge)
- 5k evt/s sustained as CI gate
- Console UI, RBAC (P4)
- Multi-anchor, air-gap
