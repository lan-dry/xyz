# Integration guide — three patterns

## 1. Synchronous API

Bank core (or adapter) calls `POST /v1/aegis/bank/events` with an ingest API key.

- Body: bank event schema (`schema_version`, `case_id`, `idempotency_key`, `event_type`, `emitted_at`, `attributes`)
- Response: `outcome` = `allow` | `hold` | `stop`, plus `case_id`, `decision_id`, `receipt_id`
- On `hold`, wait for human approval before completing the action
- On `stop`, do not proceed
- Malformed events return **HTTP 400** with machine-readable `error` / `code` / `fields`

See `examples/bank-core-stub`.

## 2. Webhook

Configure an org webhook. Aegis posts decision notifications (HMAC signed). The notification must not contain sensitive field values. Approval always requires authenticated login; notification links never approve alone.

Retry with backoff and a delivery log are required for production hardening (P3); check `docs/GAP_REPORT.md` for current status.

## 3. Batch import (record-only pilot)

Use CSV or JSON Lines with a column mapping file.

- Dry-run returns a validation report and row-level errors
- Import should run in **record-only** mode for the first pilot
- Idempotency keys per row prevent duplicates

Code: `services/aegis-api/src/bank/batch-import.ts`

## Client resilience

TypeScript SDK `wrapFetch` supports:

- `failMode: "fail_closed" | "fail_open_buffer"`
- `onUnreachable: "hold" | "proceed_and_flag"` (alias)

`proceed_and_flag` queues signed decisions locally for later drain. Receipts for those paths should carry `decided_without_aegis = true` once the reconciliation path is fully wired.
