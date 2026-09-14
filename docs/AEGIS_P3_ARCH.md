# Aegis P3 architecture (MVP backbone slice)

**Status:** P3 COMPLETE (engineering) — vertical path, blob store (local + S3), OTS anchor + reconcile, Tier A+C export verify, bench harness.

## Data flow

```
SDK recordCloud / POST /api/aegis/ingest
        │
        ▼ (validate + API key; idempotency read from Postgres)
   JetStream publish  subject: aegis.events.ingest
        │
        ▼
 aegis-ledger-writer (durable consumer: aegis-ledger-writer)
        │
        ├── Postgres aegis_ingest_events (sole writer)
        │     └── payload_blob_key → blob store (local or S3)
        ├── aegis_ledger_batches (Merkle root + anchor)
        │     └── ots_blob_key → blob store when OTS pending
        └── ack after durable write
        │
        ▼
 pnpm aegis:anchor-reconcile  (optional; pending → anchored)
        │
        ▼
 replayEvents / buildEvidenceExportPack / verifyExportPack
        │
        ├── pnpm aegis:p3-smoke
        ├── pnpm aegis:verify-pack <export.json>
        └── pnpm aegis:p3-bench
```

## Design decisions

| Topic | Choice |
|-------|--------|
| Postgres writer | **Ledger worker only** — ingest does not `create` rows when `NATS_URL` / `AEGIS_INGEST_MODE=bus` |
| Idempotency | Ingest reads `aegis_ingest_events` by `idempotency_key`; worker dedupes on insert |
| Ingest HTTP 201 | Returned after **JetStream publish ack** (not after ledger flush) |
| Anchor (FR-AEG-ANCHOR-OTS) | `AEGIS_ANCHOR_MODE=stub` (default) or `ots` — calendar HTTP submit, `anchor_status` ∈ `stub` \| `pending` \| `anchored` |
| Anchor reconcile | `pnpm aegis:anchor-reconcile` — upgrades OTS proof via calendar, detects Bitcoin confirmation |
| Object storage (FR-AEG-LEDGER-OBJ) | `@salanor/aegis-storage` — `local`, `s3` (R2/MinIO), or `none` |
| Offline verify (FR-AEG-VERIFY-OSS) | `verifyExportPack` in SDK + `pnpm aegis:verify-pack` |
| Tier C witness (FR-AEG-REPLAY-TIER-C) | Export pack `witness` block — merkle_root, anchor_status, anchor_ref, event_count, generated_at; **verification without re-executing decision logic** |
| Direct Postgres fallback | `AEGIS_INGEST_MODE=direct` or unset `NATS_URL` — P2 sync path for local dev without bus |

## Tier C witness mode

Externals verify an export pack using `pnpm aegis:verify-pack` or `verifyExportPack()`:

- **Tier A** — full event chain + deterministic replay digest
- **Tier C** — read-only `witness` block aegiss batch Merkle root and anchor metadata; no need to re-run decision engines

The witness block is auto-populated by `buildEvidenceExportPack` when an `anchor` is present.

## Packages / apps

| Path | Role |
|------|------|
| `packages/aegis-bus` | JetStream, Merkle, anchor providers, OTS verify |
| `packages/aegis-storage` | Pluggable blob store (local FS, S3-compatible) |
| `packages/aegis-ledger-sdk` | SDK, export pack, `verifyExportPack`, witness |
| `apps/aegis-ledger-writer` | NATS consumer → Prisma ledger + batch anchor + blobs |
| `apps/web/.../ingest/route.ts` | Edge collector (TS); publishes when bus enabled |
| `tools/aegis-p3-smoke` | End-to-end smoke |
| `tools/aegis-verify-pack` | Offline export CLI |
| `tools/aegis-p3-bench` | Ingest latency / throughput sample |
| `tools/aegis-anchor-reconcile` | OTS pending → anchored promotion |

## Environment

See `.env.example`:

| Variable | Purpose |
|----------|---------|
| `NATS_URL`, `AEGIS_NATS_*`, `AEGIS_INGEST_MODE` | Bus ingest |
| `AEGIS_BLOB_STORE` | `none` (default), `local`, or `s3` |
| `AEGIS_BLOB_LOCAL_PATH` | Blob root (default `tmp/aegis-blobs`) |
| `AEGIS_S3_ENDPOINT`, `AEGIS_S3_BUCKET`, `AEGIS_S3_ACCESS_KEY`, `AEGIS_S3_SECRET_KEY` | S3-compatible store (R2, MinIO) |
| `AEGIS_S3_REGION` | Optional region (default `auto` for R2) |
| `AEGIS_S3_FORCE_PATH_STYLE` | `1` for R2/MinIO path-style URLs |
| `AEGIS_ANCHOR_MODE` | `stub` or `ots` |
| `AEGIS_OTS_CALENDAR_URL` | Calendar base (default `https://a.pool.opentimestamps.org`) |
| `AEGIS_OTS_DISABLED` | `1` → skip calendar HTTP (CI / offline stub only) |
| `AEGIS_P3_BENCH_COUNT` | Bench event count (default 100); or `pnpm aegis:p3-bench --count 5000` |
| `AEGIS_ANCHOR_RECONCILE_DRY_RUN` | `1` → reconcile logs only, no DB writes |
| `AEGIS_ANCHOR_RECONCILE_LIMIT` | Max pending batches per run (default 50) |

## Blob paths

| Key pattern | Content |
|-------------|---------|
| `{sha256}` | Canonical JSON event payload (content-addressed) |
| `ots/{merkleRoot}.ots` | OpenTimestamps calendar proof bytes (pending anchor) |

## Deferred (P3.5 / P4+)

- Rust collector, disk buffer (FR-AEG-COLLECT-BUF)
- Hot path p99 &lt; 1.5ms measurement (Rust edge)
- 5k evt/s sustained as CI gate
- Console UI, RBAC (P4)
- Multi-anchor, air-gap
