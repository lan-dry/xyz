# Chrome cached redirect to salanor.com on localhost

**Start here:** [DEV_URLS.md](DEV_URLS.md) (bookmarks, cache steps, env).

If **normal Chrome** sends `http://localhost:3000/aegis` to `https://salanor.com` (or `https://aegis.salanor.com`) but **Incognito** serves Aegis on localhost, the server is usually fine — Chrome is replaying an old **301 Moved Permanently** from an earlier dev build or misconfigured env.

If the address bar already shows **`salanor.com`** (not `localhost`), clearing localhost site data will not help — remove **HSTS** for `salanor.com` at `chrome://net-internals/#hsts` (see [DEV_URLS.md](DEV_URLS.md)).

Incognito has no redirect cache for that origin, so you see the current behavior (rewrite to `/aegis`, no external `Location`).

## Verify the server (not the browser)

With the dev server running (`pnpm dev` or `pnpm start`):

```powershell
cd apps/web
.\scripts\curl-aegis-redirect.ps1
```

**Expected on loopback:**

- Status `200` (or `307`/`308` only for in-app paths — not a cross-origin hop)
- **No** `Location:` header pointing at `salanor.com` or `*.salanor.com`

Example:

```text
HTTP/1.1 200 OK
...
(no Location: https://salanor.com)
```

If `curl -sI` shows `Location: https://salanor.com` or `https://aegis.salanor.com` while the request host is `localhost:3000`, that is a **code/config bug** — fix env (`PUBLIC_SITE_URL=http://localhost:3000`) and middleware, not Chrome.

## Clear Chrome’s cached redirect for localhost

### Option A — Site settings (recommended)

1. Open a new tab and go to: `chrome://settings/siteData`
2. In **Search**, type: `localhost`
3. For each `localhost` entry (especially port `3000`), click the **trash** icon to remove site data.
4. Quit Chrome completely (File → Exit, or end all Chrome processes in Task Manager).
5. Restart Chrome and open `http://localhost:3000/aegis` again.

### Option B — DevTools Application panel

1. Open `http://localhost:3000/` in Chrome.
2. Press **F12** → **Application** tab.
3. Left sidebar: **Storage** → **Clear site data**.
4. Check all boxes (especially cache and storage), click **Clear site data**.
5. Hard reload: **Ctrl+Shift+R** (Windows) or **Cmd+Shift+R** (macOS).

### Option C — Nuclear (only if A/B fail)

1. `chrome://settings/clearBrowserData`
2. Time range: **All time**
3. Enable **Cached images and files** (and optionally cookies if you do not need other localhost apps).
4. Clear, restart Chrome.

## Why Incognito works

| | Normal profile | Incognito |
|--|----------------|-----------|
| Cached 301 for `localhost:3000/aegis` | Yes — Chrome may never revalidate | No — fresh profile for the session |
| Service worker / HSTS for localhost | Can persist | Usually absent |
| Result | Old `Location: https://salanor.com` replayed | Current middleware rewrite |

## What correct dev behavior looks like

- `http://localhost:3000/aegis` → **rewrite** to the Aegis app at `/aegis` (same host, no redirect to production).
- `http://aegis.localhost:3000/` → product host (optional canonical redirect from loopback apex only when you hit `/aegis` on plain `localhost` — by design we rewrite in place on apex).

Production (`https://salanor.com/aegis`) still **301/302** to `https://aegis.salanor.com/` — that is intentional and only applies when the request `Host` is the real marketing domain, not loopback.
