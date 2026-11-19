# Stage 6 report: Independent capture / PG collector

Branch `feature/provenance-g3-kms`. Status: **Done** for live pgoutput G3 on bank-core
(`:5436`, `wal_level=logical`). Key custody against a real AWS KMS key remains **Partial**
on this host (no `AEGIS_RECEIPT_KMS_KEY_ID` / AWS credentials) — code path is ready.

## Verdict

Live **pgoutput** consume (maintained `pg-logical-replication`), value-hash matching,
`db_value_mismatch` + contradicted UI, Red Team #6/#11/#13, and story
`loan_large_with_cdc` → G3 were exercised against Docker bank-core Postgres.

## What Stage 6 delivers

| # | Requirement | Where | Status |
| --- | --- | --- | --- |
| 1 | `packages/aegis-collector-pg` — real pgoutput loop, LSN resume/reconnect, source-sign `src_core_cdc` → `/v1/aegis/collector-events`, own process/creds | `packages/aegis-collector-pg/**` | **Done** |
| 2 | Bank-core `wal_level=logical`; app role without REPLICATION; collector REPLICATION; publication + one slot | `tools/bank-simulator/docker-compose.bank.yml`, `bank-core-init.sql` | **Done** |
| 3 | Value-hash match (amount/currency/beneficiary) → G3; no app event → `db_change_without_event`; mismatch → `db_value_mismatch` (no G3); post-G3 contradict keeps sealed history | `collector-match.ts`, UI | **Done** |
| 4 | Live tests + Red Team #6/#11/#13 | `_live_g3.mjs`, redteam | **Done** |
| 5 | Story `loan_large_with_cdc` → G3 + screenshots | `docs/TEST_PACK/provenance/` | **Done** |
| 6 | AWS KMS Ed25519 for receipts + decision tokens | `kms-ed25519.ts`, `receipt-signing.ts` | **Partial** (code Done; live key SKIP) |

## Environment (live)

| Piece | Value |
| --- | --- |
| bank-core Postgres | `:5436`, `wal_level=logical` |
| Application role | `bank_app` (no REPLICATION) |
| Collector role | `aegis_collector` (REPLICATION) |
| Publication | `aegis_collector` (`bank_account`, `bank_transaction`) |
| Slot | `aegis_collector_slot` (pgoutput) |
| Collector process | `aegis-collector-pg start` with config under `tools/bank-simulator/.bank-simulator/` |

## Matching rules

1. Hash = sha256(JCS({ amount, currency, beneficiary_account })) from CDC new values.
2. Same hash from decision-token executable params (or case/receipt attributes).
3. Equal → `independently_captured` / G3.
4. No app event → `db_change_without_event`.
5. Differ → `db_value_mismatch`, **no** G3 upgrade.
6. Later mismatch after G3 → keep sealed grade history; show **contradicted on \<time\>** on the case page and in Exceptions.

## Live proof (2026-11-19)

Raw: `docs/provenance/_raw/live_g3_console.txt`, `live_g3_summary.json`, `redteam_6_11_13_g3.txt`.

| Check | Result |
| --- | --- |
| `loan_large_with_cdc` → G3 via live CDC | **PASS** (`SIM-DFD9C418F6`) |
| Insider `UPDATE` amount → `db_value_mismatch` ≤60s; grade stays G3 | **PASS** (~209 ms) |
| Direct INSERT, no app event → `db_change_without_event` | **PASS** (~184 ms) |
| Red Team #6 `executed_without_receipt` | **PASS** |
| Red Team #11 `db_change_without_event` | **PASS** |
| Red Team #13 `amount_mismatch` | **PASS** |
| Screenshots | `case-g3-independently-captured.png`, `exceptions-insider-edit.png`, `case-g3-contradicted.png` |
| `pnpm smoke:kms` | **Partial** — `SKIP … AEGIS_RECEIPT_KMS_KEY_ID is not set` |

## Choices

1. Ingest path remains `POST /v1/aegis/collector-events` (source `kind=collector`).
2. Library: `pg-logical-replication` + `PgoutputPlugin` (manual ack after durable ingest).
3. Triggers are still refused as a G3 path.
4. KMS: `ECC_NIST_EDWARDS25519` / `ED25519_SHA_512` / `MessageType=RAW` over the same 32-byte receipt/token digest; offline verifiers unchanged.

## Docs

- `docs/provenance/COLLECTOR.md`
- `docs/PROVENANCE.md`, `docs/DEMO.md`
- `docs/provenance/FINAL_STATUS.md`, `ASSURANCE_LADDER.md`
- `docs/KEY_CUSTODY.md` (Plan A KMS)
