# Stage 8 report: Red Team suite + multi-system bank test environment

Branch `feature/provenance`. **Not committed** (per request). `spec/` untouched.

Status: **Partial** (live Red Team + separate Connectors advanced; several buttons remain Simulation).

## Verdict

The bank simulator is a multi-system staff UI (LOS / Core / Pay / Bureau) with a Red Team
panel for attacks #1–18. Buttons call the real Aegis API when configured; anything that
cannot run live is labelled **Simulation** on screen and **Simulated** in the report
(not Done). `pnpm demo:connectors` runs separate Connector processes on :8787–:8789 with
registered keys. Core ledger stays **memory** when `BANK_CORE_DATABASE_URL` / Docker is
unavailable.

## What Stage 8 delivers

| # | Requirement | Where | Status |
| --- | --- | --- | --- |
| 1 | LOS (`src_los`) via Connector | `real-connectors.mjs`, `demo:connectors` | **Done** (separate processes + in-process fallback) |
| 2 | Core Banking Postgres; confirm before disburse; feed | `core-ledger.mjs` | **Partial** — memory ledger on this host |
| 3 | Payment Gateway stub (`src_pay`) | systems registry | **Partial** — confirm-before-send stub |
| 4 | Credit Bureau stub | `tools/demo-bureau` | **Done** |
| 5 | One Connector instance per system | `demo:connectors` + RealConnectors | **Done** |
| 6 | Staff UI: connection, key id, last seq, outbox | `page.html`, `GET /api/systems` | **Done** |
| 7 | Red Team panel: Live vs Simulation | `redteam-live.mjs`, `page.html` | **Partial** — see matrix |
| 8 | Stories incl. G2 | `stories.mjs` | **Partial** — live G2 needs clean seq + reconcile |
| 9 | `pnpm bank:up` / `pnpm bank:down` | bank-up/down | **Partial** (Docker unstable) |
| 10 | `pnpm test:redteam` | fixtures + live optional | **Done** (fixtures); live Partial |
| 11 | This report | `STAGE_8_REPORT.md` | **Done** |

## Attack Live / Simulated matrix (panel, 2026-11-19)

Raw: `docs/provenance/_raw/redteam_18.txt`

| # | Attack | Panel | Status |
| --- | --- | --- | --- |
| 1 | Forged signature | Live → HTTP 401 | **Live** |
| 2 | Unknown key | Live → HTTP 401 | **Live** |
| 3 | Replay | Live → HTTP 400 | **Live** |
| 4 | Ingest key only | Live → HTTP 400 | **Live** |
| 5 | 4M / 18M confirm | Live → confirm refused | **Live** (forged token path; full issued-token mismatch still fixture) |
| 6 | No token bypass | Live core refuse + forced write | **Live** |
| 7 | Token reuse | Live confirms refused | **Live** (needs issued token for true reuse) |
| 8 | Execute after stop | Live confirm refused | **Live** |
| 9 | Approver swapped | Simulation | **Simulated** |
| 10 | Requester self-approve | Simulation | **Simulated** |
| 11 | Direct ledger edit | Live | **Live** (CDC match Stage 6 Partial) |
| 12 | LOS ≠ bureau score | Live attempt / fixture | **Partial** |
| 13 | Feed row edited | Live export | **Live** |
| 14 | Source silent | Simulation | **Simulated** |
| 15 | Aegis unavailable | Simulation | **Simulated** |
| 16 | Connector crash | Live outbox sim | **Live** |
| 17 | Tamper receipt/bundle | Simulation | **Simulated** |
| 18 | Old pre-change bundle | Simulation | **Simulated** |
| — | Honest limit | Live preferred | **Partial** |

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
