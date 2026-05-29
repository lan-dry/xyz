# Salanor monorepo

Platform monorepo for [Salanor](https://salanor.com) products. **Aegis** (`aegis`) is the first product.

## Stage 3 (current)

Signed APS-1 event ingest (`POST /v1/aegis/events`), `@salanor/aegis` `signAndIngest()`, and `pnpm demo:ingest` — no proxy yet.

| Path | Purpose |
|------|---------|
| `apps/web-console` | Operator console — `/aegis` placeholder |
| `apps/web-marketing` | Marketing — `/products/aegis` placeholder |
| `services/aegis-api` | API — `GET /health` |
| `sdks/typescript` | npm `@salanor/aegis` |
| `packages/config`, `packages/ui` | Shared tooling |

Contracts and schema: `docs-internal/` (see [Implementation plan](docs-internal/IMPLEMENTATION_PLAN.md)).

## Quick start

```bash
git clone git@github.com:salanor-ltd/salanor.git
cd salanor
pnpm install
docker compose up -d
pnpm db:migrate && pnpm db:seed
pnpm --filter aegis-api test
curl -f http://localhost:8080/health
```

Full guide: [docs/DEV.md](docs/DEV.md).

## Frozen naming (ADR)

- Product slug: **aegis** — `@salanor/aegis`, `app.salanor.com/aegis`
- Isolation: **organization** / `organization_id` (not tenant)

## License

Proprietary — Salanor Ltd.
