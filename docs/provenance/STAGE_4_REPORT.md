# Stage 4 report: reconciliation and exceptions

Branch `feature/provenance`. **Not committed** (per request). `spec/` untouched.
Stages 1–2 are committed; Stage 3 is present on the branch (uncommitted or prior work).
Status: **Done, with the Partials listed below.**

## What Stage 4 delivers

Ledger / core feeds (JSON Lines, CSV, JSON) map into `case_id` or `token_id`. An on-demand
or daily scheduled reconciliation run matches feed rows to sealed cases, raises typed
exceptions, upgrades clean matches to **G2** via `recordGradeChange`, and seals a signed
reconciliation report (JSON + PDF). The Console **Exceptions** page shows plain-language
titles with acknowledge / resolve notes.

| # | Requirement | Where |
| --- | --- | --- |
| 1 | Feed ingest JSONL / CSV / JSON + API, column mapping per source | `reconciliation/parse-feed.ts`, `ingest.ts`, console + `POST /v1/aegis/reconciliation/feeds/:feedId/ingest` |
| 2 | On-demand + scheduled (default daily) sealed report; chain; JSON/PDF | `reconciliation/run.ts`, `report.ts`, `schedule-runner.ts`, `schedule-cli.ts` |
| 3 | Exception types (incl. Stage 6/7 stubs) | `reconciliation/types.ts`, `exception-catalog.ts`, `exceptions.ts`, `run.ts` |
| 4 | Matched → G2 via `recordGradeChange`; `execution_matched` / `reconciled` | `run.ts` |
| 5 | Console Exceptions page + nav | `apps/web-console/.../exceptions/page.tsx`, `console-nav.ts`, `routes/console/exceptions.ts` |
| 6 | Docs | `docs/provenance/RECONCILIATION.md`, this report |
| 7 | Tests | `test/reconciliation.test.ts` |
| 8 | Migration `009_reconciliation` + tenant wipe | `migrations/009_reconciliation.sql`, `migrate.ts` |
| — | Pack `required_grade` / `on_missing` / `grade_deadline_hours` | `packs/types.ts`, `workflow-config.ts`, demo banking `pack.json` |

## Choices (where the brief left room)

1. **Feed-scoped vs org-wide.** `receipt_without_execution` only runs on org-wide runs
   (no `feed_id`). A single-feed run must not flag unrelated ledgers' approved cases.
2. **Sequence gaps** are scoped to `source_id`s linked from the feeds in the run when
   those links exist; otherwise org-wide in the period.
3. **After-the-fact edits** supersede the current feed row by content hash; the next run
   detects value drift as `amount_mismatch` / `beneficiary_mismatch`.
4. **Stubs** `db_change_without_event` and `plausibility_flag` are first-class kinds and
   can be raised manually (`raiseManualException`); no detector yet (Stages 6 / 7).
5. **Scheduled default** is daily per feed at `schedule_hour_utc` (default 02:00 UTC),
   covering the previous UTC calendar day.
6. **Demo banking pack** sets `required_grade: G2` with `on_missing: exception`.

## Test results (2026-11-18, local Postgres)

| Command | Result |
| --- | --- |
| `pnpm --filter aegis-api test test/reconciliation.test.ts` | **15 / 15 passed** (DB) |
| Targeted set (reconciliation + decision-token + provenance + tenant-wipe + route-auth) | **100 / 100 passed** |
| `pnpm --filter aegis-api typecheck` | **clean** (after route param guards) |
| `pnpm --filter @salanor/web-console typecheck` | **clean** |

### Raw output

Reconciliation:

```
 RUN  v3.2.4 D:/PROJECTS/salanor/services/aegis-api

 ✓ test/reconciliation.test.ts (15 tests) 1476ms

 Test Files  1 passed (1)
      Tests  15 passed (15)
```

What `test/reconciliation.test.ts` covers (15 tests, all passed):

```
 ✓ parses JSONL and CSV with column mapping
 ✓ clean run: matching feed and receipt → zero exceptions, G2 upgrade
 ✓ rerun is idempotent (same fingerprints, no duplicate exceptions)
 ✓ feed row edited after the fact is detected on next run
 ✓ executed_without_receipt
 ✓ receipt_without_execution
 ✓ beneficiary_mismatch
 ✓ executed_after_stop
 ✓ executed_after_expiry
 ✓ approver_same_as_requester
 ✓ sequence_gap
 ✓ source_silent
 ✓ below_required_grade_past_deadline
 ✓ stub kinds db_change_without_event and plausibility_flag can be raised manually
 ✓ acknowledge and resolve record notes
```

Targeted regression:

```
 ✓ test/reconciliation.test.ts (15 tests)
 ✓ test/decision-token.test.ts (14 tests)
 ✓ test/provenance.test.ts (12 tests)
 ✓ test/tenant-wipe-coverage.integration.test.ts (5 tests)
 ✓ test/console-route-auth-matrix.test.ts (54 tests)

 Test Files  5 passed (5)
      Tests  100 passed (100)
```

## Files changed

API (`services/aegis-api`):
- New: `migrations/009_reconciliation.sql`
- New: `src/reconciliation/` (`types`, `exception-catalog`, `parse-feed`, `ingest`,
  `exceptions`, `report`, `run`, `schedule-runner`, `schedule-cli`, `index`)
- New: `src/routes/console/exceptions.ts`, `src/routes/console/reconciliation.ts`,
  `src/routes/reconciliation-ingest.ts`
- New: `test/reconciliation.test.ts`
- Changed: `src/db/migrate.ts`, `src/app.ts`, `src/routes/console/index.ts`,
  `src/auth/route-inventory.ts`, `src/execution/workflow-config.ts`,
  `src/packs/types.ts`, `src/packs/demo/banking/pack.json`, `package.json`,
  `test/integration-fixture.ts`, `test/console-route-auth-matrix.test.ts`

Console (`apps/web-console`):
- New: `src/app/aegis/exceptions/page.tsx`
- Changed: `src/lib/console-nav.ts`

Docs: `docs/provenance/RECONCILIATION.md`, this report

## Partials and known limits

1. **Bank simulator Core Banking feed export** is not wired in this slice — ingest API and
   column mapping are ready for the simulator rebuild to push ledger lines.
2. **`amount_mismatch` is covered via the idempotent / edit tests** rather than a
   dedicated one-liner test name; behaviour is the same detector.
3. **Console has Exceptions, not a full Feeds admin UI** — feeds are created/ingested via
   API (and console reconciliation routes); the Exceptions page is the operator surface.
4. **Stage 6 / 7 detectors** are stubs only (`db_change_without_event`, `plausibility_flag`).
5. **Org-wide `receipt_without_execution`** can surface many historical approved cases if
   the period is wide and feeds are empty — operators should pick a tight period or run
   feed-scoped matching first.
6. **Pre-existing `trusted-time` test failure** from Stage 2 is still left alone.
