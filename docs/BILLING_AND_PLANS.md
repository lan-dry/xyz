# Billing and plans

Published pricing: **https://www.salanor.com/pricing**

Source of truth for limits: Postgres `plan_catalog` (seed migration 008, GTM update **028**). Marketing copy: `apps/web-marketing/src/lib/pricing-content.ts`.

## Three tiers

| Slug | Display | Price | Checkout | Primary buyer |
|------|---------|-------|----------|---------------|
| `free` | Free | $0 | Signup only | Eval, design partners, demos |
| `team` | Team | **$299/mo** | Stripe self-serve | Production team, first revenue |
| `enterprise` | Enterprise | **from ~$999/mo** | Sales invoice | Regulated, SSO, custom retention |

### Why these numbers

- **$299/mo Team** is deliberately above your COGS (Railway ~$20, Resend ~$20, n8n self-hosted or cloud tier) but far below legacy GRC/governance tools ($1,500+/mo). You are selling audit defensibility, not compute.
- **Free 10k events** is set in **Platform Ops → Plans**, not in code. Change limits there anytime.
- **Enterprise** is negotiated; list price is a floor for sales conversations.

## Where to change things (no migration)

| What you change | Where |
|-----------------|--------|
| Events/month, keys, members, retention | **Platform Ops → Plans** (`PATCH /v1/id/platform/plan-catalog/:slug`) |
| Dollar amount on website | `apps/web-marketing/src/lib/pricing-content.ts` |
| What Stripe charges | Stripe Dashboard → new Price → paste `stripe_price_id` in Ops → Plans |
| Per-org custom caps | Platform Ops → Organization → `plan_overrides` |

**Migrations** are only for schema (tables, columns). Migration **028** adds `compliance_export.created_at` so Free-tier export limits work. Do **not** create a migration when you change $299 to $349.

### One-time: align plan limits to published tiers

After deploy, open Platform Ops → Plans and set:

| Slug | Events/mo | Keys | Members | Retention |
|------|-----------|------|---------|-----------|
| free | 10000 | 3 | 5 | 90 |
| team | 100000 | 15 | 25 | 365 |
| enterprise | (blank = unlimited) | 100 | 500 | 2555 |

Or run a one-off SQL in prod if you prefer; UI is the ongoing source of truth.

## Feature gates (enforced in API)

| Feature | Free | Team+ |
|---------|------|-------|
| Ingest / policy / approvals | Yes | Yes |
| Compliance exports | 2 / calendar month | Unlimited |
| Scheduled exports | No | Yes |
| Event / key / member caps | Yes | Yes |

Retention is displayed in Console; automated purge by retention is roadmap.

## Stripe setup (Team self-serve)

1. Create Stripe Product: **Salanor Aegis Team**.
2. Create recurring Price: **$299 USD / month**.
3. Platform Ops → Plans → Team → **Stripe price ID** → `price_…`.
4. Deploy billing service with:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - Webhook endpoint: `POST /v1/billing/webhooks/stripe`
5. Console env: `BILLING_API_URL=https://billing…` (or internal Railway URL).
6. Kill switch (optional): `BILLING_CHECKOUT_ENABLED=0`.

Customer flow: Console → Settings → Billing → **Upgrade to Team** → Stripe Checkout → webhook activates plan.

## Sales-led (Enterprise)

1. Platform Ops → Organizations → select org.
2. **Record pending invoice** (org stays on Free until paid).
3. After payment: **Mark paid** with plan `enterprise`, period dates, invoice ref.
4. Optional: `plan_overrides` for custom event caps without changing catalog.

## Ops checklist before first invoice

- [ ] Migration **028** applied (`compliance_export.created_at`)
- [ ] Platform Ops Plans limits set (see BILLING_AND_PLANS.md)
- [ ] `/pricing` deployed on marketing
- [ ] Trust page does not claim Salanor SOC 2 cert
- [ ] Demo org on Team or Enterprise for export-heavy demos
