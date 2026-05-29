# Migrations

| File | Purpose |
|------|---------|
| `001_initial.up.sql` | Copy of `docs-internal/schema/v1/001_initial.sql` — update both when schema changes |
| `001_initial.down.sql` | Rollback all v1 tables |

Tracked in `schema_migration` table. CLI: `pnpm db:migrate` / `pnpm db:migrate:down`.
