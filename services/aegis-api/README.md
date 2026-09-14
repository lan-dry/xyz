# aegis-api

P0 HTTP API for Aegis ingest and console reads.

## Stage 2

- SQL migrations from `docs-internal/schema/v1/001_initial.sql` (`migrations/001_initial.up.sql`)
- `pnpm db:migrate` / `pnpm db:migrate:down` — rollback and re-apply
- Org-scoped repo: `src/repo/events.ts` (all reads filter `organization_id`)
- Integration tests: `TestOrgIsolation`, migration up/down/up

## Stage 1

- `GET /health` — liveness + database ping when `DATABASE_URL` is set
- TypeScript + Hono (blueprint Go + sqlc can replace data layer later)

## Run locally

```bash
pnpm --filter aegis-api dev
curl -f http://localhost:8080/health
```

## Environment

| Variable         | Default |
| ---------------- | ------- |
| `AEGIS_API_PORT` | `8080`  |
| `DATABASE_URL`   | — (Stage 2) |
| `REDIS_URL`      | — (Stage 2) |
