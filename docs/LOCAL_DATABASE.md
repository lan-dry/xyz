# Local Postgres (save Neon CU-hours)

Use **Docker Postgres** for day-to-day dev and **`pnpm test`**. Point **`DATABASE_URL`** at localhost — not Neon — so integration tests do not wake remote compute.

## Quick start

1. In `.env` / `.env.local`:

```env
DATABASE_URL=postgresql://salanor:salanor@127.0.0.1:5435/aegis
STOA_DATABASE_URL=postgresql://salanor:salanor@127.0.0.1:5435/stoa
```

2. Start Postgres (Demo Bank / production-style local DB on **5435**):

```bash
docker compose -f deploy/docker/docker-compose.postgres-demo.yml up -d
```

(`docker compose up -d` at the repo root still starts a separate Postgres on **5432**; prefer one host and match `.env` to it.)

**Stoa** uses a separate database name on the same Postgres. Create it once:

```bash
docker exec aegis-pg-demo psql -U salanor -d aegis -c "CREATE DATABASE stoa;"
pnpm db:migrate:stoa
pnpm db:seed:stoa
```
3. Same path as production:

```bash
pnpm db:migrate
# PowerShell:
$env:BOOTSTRAP_ADMIN_EMAIL="you@salanor.com"
$env:BOOTSTRAP_ADMIN_PASSWORD="your-long-password"
pnpm db:seed:bootstrap
```

4. Optional — pilot agent / ingest on **Northwind Payments** (`northwind-payments`):

```bash
pnpm db:local:pilot-fixture
```

Ingest + signing: set in **repo root `.env` only** (`AEGIS_INGEST_DEV_KEY`, `DEV_SIGNING_PRIVATE_KEY_B64` from `.env.example`). `pnpm pilot:ensure-policy` and `pnpm pilot:agent` resolve Northwind from Postgres and ignore stale `AEGIS_ORGANIZATION_ID` values. Remove old Console pastes from `.env` after `pilot:reset` if you still see warnings.

One-shot reset (wipes the Docker volume):

```bash
pnpm pilot:reset
```

(`BOOTSTRAP_*` must be in `.env`.)

## Full reset without deleting the volume

In `psql` or any SQL client against local Postgres:

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO PUBLIC;
```

Then `pnpm db:migrate`, `pnpm db:seed:bootstrap`, and optionally `pnpm db:local:pilot-fixture`.

## Neon (staging / production only)

- **Never** point local tests at Neon if you can avoid it.
- Reset Neon the same way: SQL Editor → drop schema → `pnpm db:migrate` → `pnpm db:seed:bootstrap` only.
- One human account: **`pnpm db:seed:bootstrap`** with your real email (same as Neon prod).
- **`pnpm db:local:pilot-fixture`** adds **Northwind Payments** (refund, payout, KYC agents) plus ingest. Bootstrap also creates **Salanor Platform** (staff). Switch org in Console to Northwind for the pilot demo.

See also: `services/aegis-api/migrations/README.md`, `docs/DATABASE_SAFETY.md`.
