# Migrations (forward-only)

One SQL file per version. Applied in order; recorded in `schema_migration`.

| File | Purpose |
|------|---------|
| `001_baseline.sql` | Full Aegis + platform schema |

**Apply:** `pnpm db:migrate` (from repo root).

**Reset (empty DB):** drop schema in Neon — see `docs/DATABASE_SAFETY.md` — then `pnpm db:migrate` again. There is no `down` migration; use Neon PITR if you need to undo prod changes.

**Seed prod:** `pnpm db:seed:bootstrap` only — not `pnpm db:seed`.

**Add a change later:** add `002_short_name.sql`, register it in `src/db/migrate.ts`.
