# Migrations (forward-only)

One greenfield SQL file. **No `ALTER` upgrade path** — reset an empty database when the baseline changes.

| File | Purpose |
|------|---------|
| `001_baseline.sql` | Full schema: Aegis, platform, web CMS (research byline on `account`, newsletter, careers, …). Seeds `plan_catalog` + internal org `salanor-platform`. |
| `001_baseline.dbml` | [dbdiagram.io](https://dbdiagram.io) diagram (Import → DBML). Regenerate: `python docs/tools/sql_to_dbdiagram.py`. |
| `001_baseline.dbdiagram.sql` | Same schema, `CREATE TABLE` only (PostgreSQL import fallback). Omits indexes, seeds, `event.search_vector` generated column. |

**Apply:** `pnpm db:migrate` (from repo root). Forward migrations after baseline: e.g. `002_account_byline_social` (author LinkedIn/X/Instagram on `account`).

## Reset + migrate + superadmin (prod or local Neon)

When you can wipe the database (no data to keep):

1. **Neon SQL Editor** (or `psql` with direct URL):

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
```

2. **From repo root** (`.env` → target database):

```powershell
pnpm db:migrate
$env:BOOTSTRAP_ADMIN_EMAIL="you@salanor.com"
$env:BOOTSTRAP_ADMIN_PASSWORD="your-long-password-here"
pnpm db:seed:bootstrap
```

3. Sign in at Platform Ops (`:3003` or ops.salanor.com).

Local dev uses the same bootstrap path; optional `pnpm db:local:pilot-fixture` (Docker only) for `dev-org` + pilot-agent. See `docs/LOCAL_DATABASE.md`.

**Prisma:** after schema work, `pnpm db:generate` (never `db:push` on the shared Aegis URL — see `docs/DATABASE_SAFETY.md`).

## Two organizations before?

`001_baseline` inserts one row: **`salanor-platform`** (audit anchor, no members yet). Older bootstrap also created a second org slug **`salanor`**, so Ops showed **2 orgs / 1 user**. Bootstrap now **activates `salanor-platform` and adds the superadmin membership there only**.

## Add schema later

Add `002_short_name.sql`, register in `src/db/migrate.ts`. Prefer forward-only `ALTER` only when you cannot reset prod; otherwise squash into `001` for greenfield and reset dev/staging.
