# Local development (web)

**Daily URLs:** [DEV_URLS.md](DEV_URLS.md)

## Hosts file

**Not required** for normal work. Use http://localhost:3000 with path prefixes only.

Optional: if you still open legacy `*.localhost` bookmarks, add:

```
127.0.0.1 aegis.localhost docs.aegis.localhost app.aegis.localhost
```

Middleware redirects those hosts to path-based URLs on `localhost:3000`.

| Legacy URL | Redirects to |
|------------|----------------|
| http://aegis.localhost:3000 | http://localhost:3000/aegis |
| http://docs.aegis.localhost:3000 | http://localhost:3000/docs/aegis |
| http://app.aegis.localhost:3000 | http://localhost:3000/app/console/aegis |

## Environment

Repo-root `.env` (see `.env.example`):

```env
PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
AUTH_URL=http://localhost:3000
AUTH_TRUST_HOST=true
```

Restart `pnpm dev` after changing env.

## Verify routing

```powershell
curl -I http://localhost:3000/app/console/aegis
```

Expect a rewrite to `/console` (or sign-in redirect when unauthenticated), not a redirect to `https://salanor.com`.
