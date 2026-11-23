# Staging environment

A second full stack: own database, own keys, own domains. Production is never pointed at staging secrets.

## What to create

| Piece | Staging example |
|-------|-----------------|
| Neon / Postgres | Separate project or branch |
| Railway `aegis-api` | `staging-api.salanor.com` |
| Railway `aegis-witness` | No public URL |
| Railway `salanor-id` | `staging-id.salanor.com` |
| Vercel console | `staging-app.salanor.com` |
| Receipt / witness keys | Distinct from production |

Copy variable **names** from `ENV.md`. Use new values only.

## Release script

```bash
pnpm launch:release-staging
```

Runs: migrate staging → deploy reminder → `smoke:production` against staging base URL.  
It prints `OK_TO_PROMOTE` only when smoke exits 0. It does **not** deploy production.

Required env for the script:

- `STAGING_API_BASE` (e.g. `https://staging-api.salanor.com`)
- `STAGING_SMOKE_*` — same as production smoke vars, pointed at staging

## Rule

Never set production `DATABASE_URL` or production KMS key id on the staging service.
