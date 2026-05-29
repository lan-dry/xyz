# Host routing (single Next.js app)

Salanor ships marketing, Attest product pages, docs, and the tenant console from **`apps/web`**. **Pattern C:** path prefixes in dev, host + short paths in prod.

## Allowlisted hosts (production)

| Host | Public paths | Internal rewrite |
|------|----------------|------------------|
| `salanor.com`, `www`, loopback | `/`, `/attest`, … | served as-is (loopback) |
| `app.salanor.com` | `/`, `/console/attest`, `/console/attest/...` | `/console`, `/console/...` |
| `docs.salanor.com` | `/`, `/attest`, `/attest/...` | `/attest/docs`, `/attest/docs/...` |

Unknown hosts → `302` to `PUBLIC_SITE_URL`.

## Development (loopback)

| Request | Behavior |
|---------|----------|
| `localhost:3000/` | Marketing |
| `localhost:3000/attest` | Attest marketing |
| `localhost:3000/app/console/attest` | Console (rewrite → `/console`) |
| `localhost:3000/docs/attest` | Docs (rewrite → `/attest/docs`) |
| `localhost:3000/admin` | Admin |
| `localhost:3000/console` | **308** → `/app/console/attest` |
| `*.localhost` (legacy) | **302** → canonical path on `localhost:3000` |

No cross-host redirects to production domains in dev.

## Configuration

```env
PUBLIC_SITE_URL=http://localhost:3000   # dev
PUBLIC_SITE_URL=https://salanor.com     # prod
```

Implementation: `apps/web/src/lib/app-paths.ts`, `public-hosts.ts`, `host-routing.ts`, `middleware.ts`.

## Console URL choice

Authenticated shell entry: **`app.salanor.com/console/attest`** (not `/attest/console`). Dev equivalent: **`localhost:3000/app/console/attest`**.

## Production env

```env
NODE_ENV=production
PUBLIC_SITE_URL=https://salanor.com
NEXT_PUBLIC_SITE_URL=https://salanor.com
AUTH_URL=https://salanor.com
```

## Adding a product (e.g. Aether)

1. Add paths under `src/app/app/console/aether` and `src/app/docs/aether`.
2. Extend `app-paths.ts` and prod rewrite tables in `public-hosts.ts`.
3. Add `app.salanor.com/console/aether` rewrite rules.
4. Update tests and this doc.
