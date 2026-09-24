# Database safety (read before any schema command)

## One Neon URL, two schemas

`DATABASE_URL` in `.env` often points at the **same Postgres** used by:

- **Aegis / platform** — `pnpm db:migrate` (`services/aegis-api/migrations/*`)
- **Marketing Prisma** — `prisma/schema.prisma` (research, careers, contacts, etc.)

These are **different migration systems**. They must not fight each other on one database.

## Never on production / shared Neon

| Command | Safe on shared Aegis DB? |
|---------|---------------------------|
| `pnpm db:migrate` | **Yes** — only Aegis SQL migrations |
| `pnpm db:push` | **NO** — Prisma drops tables not in `schema.prisma` (destroys Aegis data) |
| `pnpm db:migrate:web` | Only if you use a **separate** DB or accept Prisma owning that DB |

If Prisma warns **“You are about to drop the `organization` table”** — **answer No** and stop.

## Research / careers tables (Prisma)

Use **`pnpm db:migrate:web`** against a **marketing-only** database, **or** run `pnpm db:push` only when `DATABASE_URL` is a **throwaway/local** URL — never the same URL as Aegis prod without understanding the warning.

## If you already ran `db:push` and accepted data loss

1. **Neon Console** → your project → **Restore** / **Point-in-time recovery** (or create a branch from a timestamp **before** the push).
2. Point `DATABASE_URL` at the restored branch, verify data.
3. Promote or swap endpoints per [Neon restore docs](https://neon.tech/docs/manage/restore).
4. Do **not** run `db:push` again on the live Aegis URL.

Blog engagement and the rest of Aegis: `pnpm db:migrate` applies **`001_baseline.sql`** (forward-only; no down migrations). No Prisma push required.

## Fresh start (empty Neon, no dev seed)

When there is **no data to keep** (or after a bad `db:push`):

1. In **Neon SQL Editor** (or `psql` with your direct URL), reset the database:

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO PUBLIC;
```

(Neon roles vary; if `GRANT` fails, skip it — `CREATE SCHEMA public` is enough for migrate.)

2. From repo root with `.env` pointing at that database:

```powershell
pnpm db:migrate
$env:BOOTSTRAP_ADMIN_EMAIL="landry@salanor.com"
$env:BOOTSTRAP_ADMIN_PASSWORD="your-long-password-here"
pnpm db:seed:bootstrap
```

3. **Do not** run `pnpm db:seed` on production — that loads dev agents, demo orgs, and `@salanor.local` users.

4. Sign in at **ops.salanor.com** (Platform Ops) with the bootstrap email.

If you already had old migration rows (`001_initial` … `032_*`) in `schema_migration`, you **must** drop the schema (step 1) before `001_baseline` can apply cleanly.
