# Reconciliation and exceptions (Stage 4)

Aegis seals what sources send. That does not prove the money actually moved, or that
the ledger agrees with the sealed receipt. Reconciliation closes that gap: a **feed**
from Core Banking (or another system) is matched to sealed cases / decision tokens, and
mismatches become **exceptions** that people can acknowledge and resolve with notes.

## 1. Feeds

Each tenant feed has:

| Field | Meaning |
| --- | --- |
| `name` | Shown on grade-change reasons and the Exceptions page (e.g. "Core Banking") |
| `match_key` | `case_id` or `token_id` |
| `column_mapping` | Source column → Aegis field (`case_id`, `token_id`, `amount`, `currency`, `beneficiary_account`, `executed_at`, `external_id`) |
| `expected_interval_sec` | Optional; with a linked `source_id`, silence longer than this raises `source_silent` |
| `schedule_enabled` / `schedule_hour_utc` | Daily scheduled run (default on, 02:00 UTC) |

### Ingest formats

- **JSON Lines** (one object per line)
- **CSV** (header row + rows)
- **JSON** (array of objects, or a single object)

Console: `POST /v1/console/reconciliation/feeds/:feedId/ingest`  
API key: `POST /v1/aegis/reconciliation/feeds/:feedId/ingest`

Re-ingesting the same `external_id` with a different content hash **supersedes** the prior
current row. The next reconciliation run compares the new values and can raise
`amount_mismatch` / `beneficiary_mismatch`.

## 2. Reconciliation run

On demand (`POST /v1/console/reconciliation/runs`) or scheduled
(`pnpm --filter aegis-api reconciliation:schedule`, default daily per feed).

Each completed run seals a forensic receipt with outcome `reconciliation_report` containing:

- period start / end
- matched count
- unmatched feed count / unmatched receipt count (org-wide runs)
- exception summaries

Export: `…/runs/:runId/report.json` and `…/runs/:runId/report.pdf`.

## 3. Exception kinds

| Kind | Plain title |
| --- | --- |
| `executed_without_receipt` | Money moved with no approval record |
| `receipt_without_execution` | Approved but no matching execution in the feed |
| `amount_mismatch` | Execution amount does not match the approved amount |
| `beneficiary_mismatch` | Beneficiary does not match what was approved |
| `executed_after_stop` | Money moved after the case was stopped |
| `executed_after_expiry` | Money moved after the decision token expired |
| `approver_same_as_requester` | The same person requested and approved |
| `sequence_gap` | A gap in the source event sequence |
| `source_silent` | A source has been silent longer than expected |
| `below_required_grade_past_deadline` | Evidence grade still below the required level past the deadline |
| `db_change_without_event` | Ledger row changed with no matching application event (Stage 6 collector) |
| `plausibility_flag` | Stub for Stage 7 (raise manually) |

Exceptions are idempotent by fingerprint: a rerun updates `last_seen_at` and does not
duplicate open items.

Status: **open** → **acknowledged** (note required) → **resolved** (note required).
Notes are append-only.

## 4. Matched → G2

When a feed row matches a receipt on identity and amount/beneficiary (and the case is not
stopped), Aegis calls `recordGradeChange` to **G2** with reason:

`corroborated by <feed name> on <time>`

Checks set: `execution_matched` and `reconciled`.

## 4b. Collector CDC → G3 (Stage 6)

Independent capture from `@salanor/aegis-collector-pg` (source `src_core_cdc`, kind
`collector`) lands in `collector_cdc_event`. On each reconciliation run:

- Collector change + sealed app receipt for the same `case_id` → `recordGradeChange` to
  **G3** with `independently_captured` (reason cites the collector source and LSN).
- Collector change with no matching app event → `db_change_without_event`.

See [COLLECTOR.md](./COLLECTOR.md). Triggers are not an acceptable substitute for
logical decoding when claiming G3.

## 5. Workflow assurance (pack)

Optional on each pack workflow / `execution_config`:

| Field | Default | Meaning |
| --- | --- | --- |
| `required_grade` | none | `G1` / `G2` / `G3` |
| `on_missing` | `await` | `exception` raises `below_required_grade_past_deadline` after the deadline |
| `grade_deadline_hours` | `24` | Hours after case creation |

Demo banking pack sets `required_grade: G2`, `on_missing: exception`.

## 6. Console

**Exceptions** (`/aegis/exceptions`): plain-language title, severity, source, case link,
first seen, status, acknowledge / resolve with notes.
