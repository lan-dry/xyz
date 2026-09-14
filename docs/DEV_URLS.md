# Dev URLs (bookmark this)

Short reference for daily local work. Production URLs are what customers see.

| What | Dev URL (use daily) | Production URL |
|------|---------------------|------------------|
| Company home | http://localhost:3000 | https://salanor.com |
| Aegis marketing | http://localhost:3000/aegis | https://salanor.com/aegis |
| Aegis docs | http://localhost:3000/docs/aegis | https://docs.salanor.com/aegis |
| Tenant console (login) | http://localhost:3000/app/console/aegis | https://app.salanor.com/console/aegis |
| Admin | http://localhost:3000/admin | (internal) |

## Tired? Use these three bookmarks

1. **http://localhost:3000/aegis** — Aegis product site  
2. **http://localhost:3000/app/console/aegis** — Tenant console (sign in, API keys, org settings)  
3. **http://localhost:3000** — Salanor company home  

No hosts file required for daily work. Legacy `*.localhost` subdomains redirect once to the paths above.

## Pattern C (dev vs prod)

- **Dev:** single origin `localhost:3000` — paths only (`/app/...`, `/docs/...`, `/aegis`).
- **Prod:** host-based URLs — `app.salanor.com/console/aegis` (no `/app` prefix on the app host), `docs.salanor.com/aegis`, marketing on `salanor.com`.

## Environment

In repo-root `.env`:

```env
PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
AUTH_URL=http://localhost:3000
AUTH_TRUST_HOST=true
```

## Sign in

1. Open **http://localhost:3000/app/console/aegis** (or sign in from marketing with callback to that path).
2. Enter email → magic link stays on `localhost:3000`.
3. After sign-in you land on **`/app/console/aegis`** (address bar); middleware serves the console internally.

Legacy **`/console`** bookmarks redirect to **`/app/console/aegis`**.

## Breaking bookmarks

| Old | New |
|-----|-----|
| http://app.aegis.localhost:3000 | http://localhost:3000/app/console/aegis |
| http://docs.aegis.localhost:3000 | http://localhost:3000/docs/aegis |
| http://aegis.localhost:3000 | http://localhost:3000/aegis |
| http://localhost:3000/console | http://localhost:3000/app/console/aegis |
| https://app.aegis.salanor.com | https://app.salanor.com/console/aegis |
| https://docs.aegis.salanor.com | https://docs.salanor.com/aegis |

## More detail

- Host routing rules: [HOST_ROUTING.md](HOST_ROUTING.md)  
- Local setup: [LOCAL_DEV.md](LOCAL_DEV.md)
