# Stage 6 report: Independent capture / PG collector

Branch `feature/provenance`. **Not committed** (per request). `spec/` untouched.
Status: **Partial.**

## Verdict

Independent-capture **interfaces**, reconciliation (G3 / `db_change_without_event`),
red-team tests, and design docs are in place. Live **pgoutput** streaming was **not**
finished or tested against Docker with `wal_level=logical`.

Demo Postgres `aegis-pg-demo` on `:5435` was reachable and reported:

| setting | value |
| --- | --- |
| `wal_level` | **`replica`** (needs `logical`) |
| `max_replication_slots` | `10` |
| `max_wal_senders` | `10` |

Docker CLI itself hung in this environment; the probe used `node` + `pg` against port
5435. Triggers were **not** used as a substitute, and G3 is **not** claimed from
triggers.

## What Stage 6 delivers

| # | Requirement | Where | Status |
| --- | --- | --- | --- |
| 1 | `packages/aegis-collector-pg` — CDC interface, source `src_core_cdc` / kind collector, source-signed events (row key, op, new values hash, LSN), separate process/credential | `packages/aegis-collector-pg/**` | **Partial** (sign/send + simulated stream Done; pgoutput consume loop blocked on `wal_level`) |
| 2 | Reconciliation links collector ↔ app; `db_change_without_event`; matched → G3 via `recordGradeChange` | `reconciliation/collector-match.ts`, `run.ts` | **Done** |
| 3 | Red-team test: direct DB change → exception | `test/collector-cdc.test.ts` | **Done** (simulated collector row) |
| 4 | Payment gateway tap / webhook capture pattern | `docs/provenance/COLLECTOR.md` §5 | **Done** (documented) |
| 5 | No trigger substitute for G3 | design + `PgoutputLogicalStream` refuses non-logical | **Honored** |
| 6 | Docs | `COLLECTOR.md`, this report | **Done** |

## Choices

1. **Ingest path** is `POST /v1/aegis/collector-events` (not the bank decision path).
   Source must be `kind=collector`. Rows land in `collector_cdc_event`.
2. **Match rule** is case-level: collector `case_id` + any sealed app receipt (non
   grade-change / non recon report) → G3. Missing app side → `db_change_without_event`.
3. **pgoutput** readiness (`checkLogicalDecoding`, publication/slot helpers) is
   implemented; `START_REPLICATION` consume/decode is deliberately incomplete until a
   logical-ready Docker is available (see overlay compose file).
4. **SimulatedChangeStream** is for unit tests only; it does not claim independence by
   itself — G3 still requires a registered collector source key in production.

## Test results (2026-11-19, local)

| Command | Result |
| --- | --- |
| `pnpm --filter @salanor/aegis-collector-pg test` | **4 / 4 passed** |
| `pnpm --filter aegis-api test test/collector-cdc.test.ts` | **2 / 2 passed** (DB) |
| `pnpm --filter @salanor/aegis-collector-pg typecheck` | **clean** |
| `pnpm --filter aegis-api typecheck` | **clean** |

### Raw output (collector package)

```
 RUN  v3.2.4 D:/PROJECTS/salanor/packages/aegis-collector-pg

 ✓ test/collector.test.ts (4 tests) 103ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
```

Coverage:

```
 ✓ hashes new values with JCS sha256
 ✓ maps case_id from row_key
 ✓ source-signs CDC events and POSTs to collector ingest
 ✓ PgoutputLogicalStream refuses when wal_level is not logical
```

### Raw output (API red-team)

```
 RUN  v3.2.4 D:/PROJECTS/salanor/services/aegis-api

 ✓ test/collector-cdc.test.ts (2 tests) 339ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
```

Coverage:

```
 ✓ red team: direct DB change detected by collector → db_change_without_event
 ✓ matched collector + app event upgrades case to G3
```

## Files

Package (`packages/aegis-collector-pg`):
- New package (config, types, hash/event, simulated + pgoutput streams, collector loop, CLI, tests)

API (`services/aegis-api`):
- New: `migrations/010_collector_cdc.sql`
- New: `src/reconciliation/collector-match.ts`
- New: `src/routes/collector-events.ts`
- New: `test/collector-cdc.test.ts`
- Changed: `src/db/migrate.ts`, `src/reconciliation/run.ts`, `exception-catalog.ts`,
  `index.ts`, `src/app.ts`, `test/integration-fixture.ts`

Deploy:
- New: `deploy/docker/docker-compose.postgres-demo.logical.yml` (overlay for future
  `wal_level=logical` testing)

Docs:
- `docs/provenance/COLLECTOR.md`
- `docs/provenance/STAGE_6_REPORT.md` (this file)
- Updates: `docs/provenance/RECONCILIATION.md`, `docs/PROVENANCE.md`

## Native Postgres attempt (review close-out)

Tried finishing live pgoutput without Docker: no `psql` on PATH for a native instance with
`wal_level=logical`, `BANK_CORE_DATABASE_URL` unset, and Docker probes unreliable on this host.
**Status remains Partial** — do not claim Done until a same-engine Postgres with
`wal_level=logical` runs a real `UPDATE` through the collector loop.

## Partials / how to finish

1. **pgoutput consume loop** — run native or compose Postgres with `wal_level=logical`, create
   publication/slot, finish binary decode + `START_REPLICATION`, add an integration test that
   performs a real `UPDATE` and asserts a collector event.
2. **Docker CLI** was unresponsive here; prefer `aegis-collector-pg check` once compose
   works again.
3. **Value-hash matching** between app attributes and `new_values_hash` is not required
   for the current G3 upgrade (case identity only); tighten later if packs need it.
4. Stage 4 stub test that manually raises `db_change_without_event` remains valid; the
   detector is now live in `reconcileCollectorEvents`.
