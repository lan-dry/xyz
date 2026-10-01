# Database safety (read before any schema command)

## One Neon URL, two schemas

`DATABASE_URL` in `.env` often points at the **same Postgres** used by:

- **Aegis + Ops CMS** — `pnpm db:migrate` (`001_baseline.sql` — single greenfield file)
- **Prisma client** — `prisma/schema.prisma` (types/queries only; **schema changes go in SQL migrations**, not `db:push`, on the shared Neon URL)

On one Neon database, **`pnpm db:migrate`** is the single apply path for Aegis and for `research_posts` / `open_roles` / `contact_messages`.

## Never on production / shared Neon

| Command | Safe on shared Aegis DB? |
|---------|---------------------------|
| `pnpm db:migrate` | **Yes** — only Aegis SQL migrations |
| `pnpm db:push` | **NO** — Prisma drops tables not in `schema.prisma` (destroys Aegis data) |
| `pnpm db:migrate:web` | Only if you use a **separate** DB or accept Prisma owning that DB |

If Prisma warns **“You are about to drop the `organization` table”** — **answer No** and stop.

## Research / careers / newsletter (Platform Ops)

Included in **`001_baseline.sql`** (same `pnpm db:migrate` as Aegis). **Do not** `db:push` on prod Neon.

## If you already ran `db:push` and accepted data loss

1. **Neon Console** → your project → **Restore** / **Point-in-time recovery** (or create a branch from a timestamp **before** the push).
2. Point `DATABASE_URL` at the restored branch, verify data.
3. Promote or swap endpoints per [Neon restore docs](https://neon.tech/docs/manage/restore).
4. Do **not** run `db:push` again on the live Aegis URL.

`pnpm db:migrate` applies **`001_baseline.sql`** (Aegis + web CMS + newsletter). No Prisma push on shared prod. After a baseline change on an existing DB, **drop schema and re-migrate** (see `services/aegis-api/migrations/README.md`).

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

3. Use **`pnpm db:seed:bootstrap`** only for staff accounts. Demo org/agent data for local pilot: **`pnpm db:local:pilot-fixture`** (refuses non-local `DATABASE_URL`).

4. Sign in at **ops.salanor.com** (Platform Ops) with the bootstrap email.

If you already had old migration rows (`001_initial` … `032_*`) in `schema_migration`, you **must** drop the schema (step 1) before `001_baseline` can apply cleanly.
