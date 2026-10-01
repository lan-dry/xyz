# Blog analytics

## Ops (first-party)

Marketing records engagement in Postgres (`blog_engagement_events`) when `DATABASE_URL` is set on **web-marketing**.

| Metric | Source |
|--------|--------|
| Views, listen, shares | Ops → Content → Blog |
| **Country rollup** | ISO country on each `page_view` from edge headers (`cf-ipcountry`, `x-vercel-ip-country`) on the post edit page |

Local `next dev` usually has no country header — counts appear as **Unknown** until traffic hits production on Vercel/Cloudflare.

IP addresses are not stored in plain text for readers; a salted hash is kept for deduplication (`ip_hash` in metadata).

## Google Analytics (optional)

The marketing app can load **Google Analytics** (`gtag`) for richer geo, funnels, and campaigns. That data lives in GA, not in Platform Ops.

Use Ops stats for product-owned aggregates tied to posts; use GA when marketing needs full web analytics.

## Audit log (sign-in location)

Console and Platform Ops audit rows for `auth.login.success` store **IP** plus coarse **city / region / country** when the edge provides them. Filter logs by action `auth.login.success` (dropdown or “Sign-in success” preset).
