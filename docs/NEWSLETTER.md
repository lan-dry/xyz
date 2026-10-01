# Newsletter (marketing site)

## Subscriber lifecycle

| Step | Behavior |
|------|----------|
| Subscribe | Footer → pending until confirm |
| Confirm | Link → active; welcome email |
| Unsubscribe | Soft unsubscribe; row kept for suppression |
| Re-subscribe | New confirm flow |
| Pending resend | Same email within 15 min → no duplicate confirm mail |

**Active audience:** `confirmed_at IS NOT NULL AND unsubscribed_at IS NULL`.

## Campaigns (Platform Ops)

1. Compose (Markdown stored as `body_markdown` + rendered HTML).
2. **Test** → your Ops email.
3. **Send now** or set **Schedule send** → status `scheduled`.
4. **Cron** on www (`/api/cron/newsletter-send`, every 5 min on Vercel) sends due campaigns.
5. Campaign detail: Markdown source, rendered preview, per-recipient delivery log.

Broadcast emails include `List-Unsubscribe`, `List-Unsubscribe-Post`, and `List-ID` for Gmail/Yahoo native unsubscribe UI.

## Migrations

Single file **`001_baseline`**: `newsletter_subscribers`, `newsletter_campaigns` (incl. `body_markdown`, `scheduled_at`), `newsletter_campaign_deliveries`. Apply with `pnpm db:migrate` only after a full schema reset if you previously ran split `002`/`003` versions.

## Env (www)

- `DATABASE_URL`, `RESEND_API_KEY`, `EMAIL_FROM`
- `CRON_SECRET` — Vercel Cron auth
- `NEWSLETTER_OPS_SECRET` — Ops → internal send API

## Env (Platform Ops)

- `DATABASE_URL`, `NEWSLETTER_OPS_SECRET`, `MARKETING_INTERNAL_URL`

## Gmail / Yahoo native unsubscribe

Code requirements (already in www):

- `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` on welcome + campaigns
- `POST /api/newsletter/unsubscribe?token=…` returns **200** (no redirect)
- Unsubscribe URLs use **HTTPS** (`NEXT_PUBLIC_SITE_URL=https://www.salanor.com` on Vercel)

Operational requirements (not automatic):

- Resend domain verified (DKIM) for `EMAIL_FROM` on www
- Consistent From name/address; avoid sudden volume spikes
- Gmail “Subscriptions” UI appears after sender reputation builds — often weeks for new domains
