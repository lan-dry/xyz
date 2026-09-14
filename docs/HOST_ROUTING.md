# Host routing (single Next.js app)

Salanor ships marketing, Aegis product pages, docs, and the tenant console from **`apps/web`**. **Pattern C:** path prefixes in dev, host + short paths in prod.

## Allowlisted hosts (production)

| Host | Public paths | Internal rewrite |
|------|----------------|------------------|
| `salanor.com`, `www`, loopback | `/`, `/aegis`, … | served as-is (loopback) |
| `app.salanor.com` | `/`, `/console/aegis`, `/console/aegis/...` | `/console`, `/console/...` |
| `docs.salanor.com` | `/`, `/aegis`, `/aegis/...` | `/aegis/docs`, `/aegis/docs/...` |

Unknown hosts → `302` to `PUBLIC_SITE_URL`.

## Development (loopback)

| Request | Behavior |
|---------|----------|
| `localhost:3000/` | Marketing |
| `localhost:3000/aegis` | Aegis marketing |
| `localhost:3000/app/console/aegis` | Console (rewrite → `/console`) |
| `localhost:3000/docs/aegis` | Docs (rewrite → `/aegis/docs`) |
| `localhost:3000/admin` | Admin |
| `localhost:3000/console` | **308** → `/app/console/aegis` |
| `*.localhost` (legacy) | **302** → canonical path on `localhost:3000` |

No cross-host redirects to production domains in dev.

## Configuration

```env
PUBLIC_SITE_URL=http://localhost:3000   # dev
PUBLIC_SITE_URL=https://salanor.com     # prod
```

Implementation: `apps/web/src/lib/app-paths.ts`, `public-hosts.ts`, `host-routing.ts`, `middleware.ts`.

## Console URL choice

Authenticated shell entry: **`app.salanor.com/console/aegis`** (not `/aegis/console`). Dev equivalent: **`localhost:3000/app/console/aegis`**.

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
