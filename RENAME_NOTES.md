# Attest → Aegis rename (2026-05-29)

## Package mapping

| Before | After |
|--------|--------|
| `@salanor/attest-sdk-ts` | `@salanor/aegis-ledger-sdk` (`packages/aegis-ledger-sdk`) |
| `@salanor/attest-bus` | `@salanor/aegis-bus` |
| `@salanor/attest-storage` | `@salanor/aegis-storage` |
| `@salanor/attest-ledger-writer` | `@salanor/aegis-ledger-writer` |
| `salanor_attest` (Python) | `salanor_aegis_ledger` |

`packages/sdk-aegis` (`@salanor/aegis`) is the **customer APS SDK** and was already named Aegis; the former attest TypeScript SDK is now `aegis-ledger-sdk` to avoid a folder clash.

## Database

Migration `prisma/migrations/20260529140000_rename_attest_tables_to_aegis` renames:

- `attest_policies` → `aegis_policies`
- `attest_ingest_events` → `aegis_ingest_events`
- `attest_ledger_batches` → `aegis_ledger_batches`

Run after deploy: `pnpm exec prisma migrate deploy` (from repo root, with `DATABASE_URL` set).

## Environment variables

Rename in deployment secrets and local `.env`:

| Old | New |
|-----|-----|
| `ATTEST_*` | `AEGIS_*` (same suffix) |

Examples: `ATTEST_NATS_URL` → `AEGIS_NATS_URL`, `ATTEST_BLOB_STORE` → `AEGIS_BLOB_STORE`. Search your secret store for `ATTEST_` and rotate aliases before removing old keys.

## URLs

Product paths use `/aegis` (not `/attest`). Update bookmarks, redirects, and CDN rules.

## Production checklist

1. Apply DB migration.
2. Rotate/rename env vars (`ATTEST_*` → `AEGIS_*`).
3. Redeploy `aegis-ledger-writer`, web app, and any workers using NATS subject prefix `aegis.events` (was `attest.events`).
4. `pnpm install` and redeploy all services.
