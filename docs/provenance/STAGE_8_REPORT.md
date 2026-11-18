# Stage 8 report: Red Team suite + multi-system bank test environment

Branch `feature/provenance`. **Not committed** (per request). `spec/` untouched.

Status: **Done, with the Partials listed below.**

## Verdict

The bank simulator is extended into a multi-system staff UI (LOS / Core / Pay / Bureau)
with a Red Team panel for attacks #1–18 plus an honest-limits demo. Automated
`pnpm test:redteam` covers the catalog with fixture tests and optional live hits.
Full multi-process `bank:up` with Docker Postgres is attempted; if Docker is unstable
the stack continues with an in-memory ledger and is marked **Partial**.

## What Stage 8 delivers

| # | Requirement | Where | Status |
| --- | --- | --- | --- |
| 1 | LOS (`src_los`) via Connector (simulated per-system keys) | `connectors-sim.mjs`, systems panel | **Done** (simulated Connector; not three separate Connector processes) |
| 2 | Core Banking Postgres accounts+transactions; confirm before disburse; JSONL/CSV feed | `core-ledger.mjs`, `docker-compose.bank.yml` | **Done** when Docker healthy; **Partial** → memory ledger otherwise |
| 3 | Payment Gateway stub (`src_pay`) | systems registry + connector sim | **Done** (identity + panel; stub executor) |
| 4 | Credit Bureau stub | reuses `tools/demo-bureau` (`bank:up` starts it) | **Done** |
| 5 | One Connector instance per system (or separate keys) | `SimulatedConnectors` | **Done** (simulated) |
| 6 | Staff UI: connection, key id, last seq, outbox size | `page.html` systems panel, `GET /api/systems` | **Done** |
| 7 | Red Team panel: attacker gains + outcome | `page.html`, `redteam-attacks.mjs`, `POST /api/redteam/run` | **Done** |
| 8 | Stories: small G2; large approve+token+reconcile G2; CDC G3; stop; source silent | `stories.mjs` `target_grade` | **Done** (grades labelled; live G2/G3 still need API reconcile/collector) |
| 9 | `pnpm bank:up` / `pnpm bank:down` | `bank-up.mjs`, `bank-down.mjs` | **Done** (Docker Partial if unstable) |
| 10 | `pnpm test:redteam` + fixture coverage #1–18 + honest limits | `tools/redteam/run.mjs`, `test/redteam-suite.test.ts`, bank-simulator tests | **Done** |
| 11 | This report | `docs/provenance/STAGE_8_REPORT.md` | **Done** |

## Attack Done / Partial matrix

| # | Attack | Expected | Automated coverage | Status |
| --- | --- | --- | --- | --- |
| 1 | Forged signature | Rejected at ingest | `source-envelope.test.ts`, redteam `#1` verifyEnvelope | **Done** |
| 2 | Revoked / unknown key | Rejected | `source-envelope.test.ts` | **Done** |
| 3 | Replay | Rejected (seq/nonce) | `source-envelope.test.ts` | **Done** |
| 4 | Ingest key only | Reject when required; else G0 asserted | `source-envelope` + redteam panel #4 | **Done** |
| 5 | 4M approved / 18M execute | Confirm refused, mismatch | `decision-token.test.ts`, redteam `#5` | **Done** |
| 6 | No token bypass | Core refuses; forced DB → `executed_without_receipt` | bank-simulator `#6` + reconciliation test | **Done** |
| 7 | Token reuse | Refused | `decision-token` + redteam `#7` | **Done** |
| 8 | Execute after stop | Refused | `decision-token` + redteam `#8` | **Done** |
| 9 | Approver swapped | Verify fails | `approver-binding.test.ts` | **Done** |
| 10 | Requester self-approve | SoD blocked | `approver-binding.test.ts` + redteam `#10` | **Done** |
| 11 | Direct Postgres edit | `db_change_without_event` | `collector-cdc.test.ts` + simulator `#11` | **Done** (live CDC still Stage 6 Partial) |
| 12 | LOS score ≠ bureau | `fact_mismatch` | `third-party-facts.test.ts` | **Done** |
| 13 | Feed row edited | Reconcile detects | `reconciliation.test.ts` + simulator `#13` | **Done** |
| 14 | Source silent | `source_silent` | `reconciliation.test.ts` | **Done** |
| 15 | Aegis unavailable | Policy allow_and_flag / block | SDK + decision-token + simulator toggle | **Done** |
| 16 | Connector crash mid-send | No dup / seq reuse / loss | `aegis-connector` durability + simulator `#16` | **Done** |
| 17 | Tamper receipt/token/bundle | Verify fails | provenance / redteam `#17` | **Done** |
| 18 | Old pre-change bundle | G0 legacy | `provenance.test.ts` + redteam `#18` | **Done** |
| — | Honest limits | False signed value stays G1, labelled | redteam suite + `/api/honest-limit` | **Done** |

## Choices

1. **Simulated Connectors** in-process (separate key id / seq / outbox per system) rather than
   three long-running Connector binaries — matches the brief's "or simulated with separate keys"
   and keeps `bank:up` operable without registering keys against a live tenant first.
2. **Core ledger** uses Postgres when `BANK_CORE_DATABASE_URL` is set (Docker on `:5436`,
   `wal_level=logical`); otherwise memory. Story disbursements still use the existing permit
   gate and mirror into the Stage-8 ledger for feeds.
3. **Red Team buttons** run local simulations that assert the contract; cryptographic /
   DB cases reuse aegis-api fixture tests. Live `test:redteam` additionally POSTs to the
   simulator when it is up.
4. **G3 story** is labelled; actual G3 still depends on Stage 6 collector Partial.

## Partials / how to finish

1. **Docker multi-service bank:up** — if Docker Desktop / compose is unstable on the host,
   bank-core Postgres is skipped and the memory ledger is used. Re-run `pnpm bank:up` when
   Docker is healthy; do not improvise alternate DB engines.
2. **Real Connector processes** — wire `createConnector` per system with registered source
   keys against Demo Bank for a fully signed LOS→Aegis path in the simulator.
3. **End-to-end G2/G3 story automation** — auto-approve, confirm token, export feed, run
   reconciliation + collector match inside `test:redteam` against `demo:up`.
4. **Payment Gateway confirm path** — stub identity exists; add confirm-before-send like core.

## Files

Bank simulator:
- `tools/bank-simulator/systems.mjs`, `connectors-sim.mjs`, `core-ledger.mjs`,
  `redteam-attacks.mjs`, `bank-up.mjs`, `bank-down.mjs`, `docker-compose.bank.yml`
- Updated: `server.mjs`, `page.html`, `stories.mjs`, `package.json`, `README.md`
- Tests: `test/systems.test.mjs`, `test/redteam-panel.test.mjs`

Red team:
- `tools/redteam/run.mjs`
- `services/aegis-api/test/redteam-suite.test.ts`
- Root scripts: `bank:up`, `bank:down`, `test:redteam`

Docs:
- `docs/provenance/STAGE_8_REPORT.md` (this file)
- `docs/PROVENANCE.md` Stage 8 row

## Test results (2026-11-19, local)

| Command | Result |
| --- | --- |
| `pnpm bank:up` | **Partial** — Docker daemon timed out; memory ledger + bureau :4100 + simulator :4000 |
| `pnpm --filter @salanor/bank-simulator test` | **21 / 21 passed** |
| `pnpm --filter aegis-api exec vitest run test/redteam-suite.test.ts` | **10 / 10 passed** |
| `pnpm test:redteam` (with live stack) | **OK** — fixture + live attacks 1/6/11/16 + honest limit |

### Raw output (`pnpm bank:up`)

```
  bank:up — Stage 8 multi-system bank

  Partial: Docker unavailable/unstable — memory ledger only.
   docker info failed/timeout: spawnSync docker ETIMEDOUT
  demo-bureau on http://127.0.0.1:4100
  bank-simulator on http://127.0.0.1:4000 (Stage 8 Red Team API ok)

  Partials:
   - Docker bank-core Postgres not started (...ETIMEDOUT). Using in-memory ledger.
```

### Raw output (`pnpm test:redteam`)

```
--- bank-simulator systems + redteam panel ---
# tests 21
# pass 21
# fail 0

--- aegis-api redteam-suite ---
 ✓ test/redteam-suite.test.ts (10 tests)

--- live stack (optional) ---
Live simulator at http://127.0.0.1:4000: 18 attacks catalogued
[
  { "id": 1, "ok": true, "result": "Rejected at ingest ..." },
  { "id": 6, "ok": true, "result": "Core refuses without token; forced bypass ..." },
  { "id": 11, "ok": true, "result": "Direct ledger edit recorded ..." },
  { "id": 16, "ok": true, "result": "No sequence reuse; nothing lost from outbox." }
]
Honest limit: {"grade":"G1","label":"signed by source, not corroborated",...}

=== test:redteam OK ===
```
