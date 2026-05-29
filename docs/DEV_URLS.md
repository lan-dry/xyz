# Dev URLs (bookmark this)

Short reference for daily local work. Production URLs are what customers see.

| What | Dev URL (use daily) | Production URL |
|------|---------------------|------------------|
| Company home | http://localhost:3000 | https://salanor.com |
| Attest marketing | http://localhost:3000/attest | https://salanor.com/attest |
| Attest docs | http://localhost:3000/docs/attest | https://docs.salanor.com/attest |
| Tenant console (login) | http://localhost:3000/app/console/attest | https://app.salanor.com/console/attest |
| Admin | http://localhost:3000/admin | (internal) |

## Tired? Use these three bookmarks

1. **http://localhost:3000/attest** — Attest product site  
2. **http://localhost:3000/app/console/attest** — Tenant console (sign in, API keys, org settings)  
3. **http://localhost:3000** — Salanor company home  

No hosts file required for daily work. Legacy `*.localhost` subdomains redirect once to the paths above.

## Pattern C (dev vs prod)

- **Dev:** single origin `localhost:3000` — paths only (`/app/...`, `/docs/...`, `/attest`).
- **Prod:** host-based URLs — `app.salanor.com/console/attest` (no `/app` prefix on the app host), `docs.salanor.com/attest`, marketing on `salanor.com`.

## Environment

In repo-root `.env`:

```env
PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
AUTH_URL=http://localhost:3000
AUTH_TRUST_HOST=true
```

## Sign in

1. Open **http://localhost:3000/app/console/attest** (or sign in from marketing with callback to that path).
2. Enter email → magic link stays on `localhost:3000`.
3. After sign-in you land on **`/app/console/attest`** (address bar); middleware serves the console internally.

Legacy **`/console`** bookmarks redirect to **`/app/console/attest`**.

## Breaking bookmarks

| Old | New |
|-----|-----|
| http://app.attest.localhost:3000 | http://localhost:3000/app/console/attest |
| http://docs.attest.localhost:3000 | http://localhost:3000/docs/attest |
| http://attest.localhost:3000 | http://localhost:3000/attest |
| http://localhost:3000/console | http://localhost:3000/app/console/attest |
| https://app.attest.salanor.com | https://app.salanor.com/console/attest |
| https://docs.attest.salanor.com | https://docs.salanor.com/attest |

## More detail

- Host routing rules: [HOST_ROUTING.md](HOST_ROUTING.md)  
- Local setup: [LOCAL_DEV.md](LOCAL_DEV.md)
