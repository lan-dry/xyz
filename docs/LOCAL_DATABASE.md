# Local Postgres (save Neon CU-hours)

Use **Docker Postgres** for day-to-day dev and **`pnpm test`**. Point **`DATABASE_URL`** at localhost — not Neon — so integration tests do not wake remote compute.

## Quick start

1. In `.env` / `.env.local`:

```env
DATABASE_URL=postgresql://salanor:salanor@127.0.0.1:5432/aegis
```

2. Start infra:

```bash
docker compose up -d
```

3. Same path as production:

```bash
pnpm db:migrate
# PowerShell:
$env:BOOTSTRAP_ADMIN_EMAIL="you@salanor.com"
$env:BOOTSTRAP_ADMIN_PASSWORD="your-long-password"
pnpm db:seed:bootstrap
```

4. Optional — pilot agent / ingest on **the same org** (`salanor-platform`):

```bash
pnpm db:local:pilot-fixture
```

Ingest + signing: set in **repo root `.env` only** (`AEGIS_INGEST_DEV_KEY`, `DEV_SIGNING_PRIVATE_KEY_B64` from `.env.example`). `pnpm pilot:ensure-policy` and `pnpm pilot:agent` resolve the org, agent, and key from Postgres — no `apps/pilot-agent/.env` required.

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
- **`pnpm db:local:pilot-fixture`** adds demo agent/ingest on **`salanor-platform`** only — you should see **one** org in Platform Ops.

See also: `services/aegis-api/migrations/README.md`, `docs/DATABASE_SAFETY.md`.
