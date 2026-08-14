# Go-live checklist (prospecting)

See also: `PRODUCTION_READY.md` (Tier 1–3), `BILLING_AND_PLANS.md`, `RAILWAY_AEGIS_DEPLOY.md`.

## Product demo path

- [ ] Import `examples/n8n/jmt-s-content-sync-with-aegis.json` (governed)
- [ ] Link error workflow: `examples/n8n/jmt-s-aegis-error-handler.json` (Settings → Error Workflow)
- [ ] **Publish** workflow (n8n 2.x — no Active toggle)
- [ ] Policy active: `jmts.content.publish` → **require approval**
- [ ] **Salanor Aegis API** credential on nodes **7b** and **11**
- [ ] Success: production webhook `POST /webhook/jmts-content-sync-run` → approve → trace **COMPLETED**
- [ ] Failure: same webhook with auth failure path → error handler → trace **FAILED** (not Manual Trigger)
- [ ] Replay + Verify chain + inclusion on publish event

## Railway (move to Hobby)

- [ ] Upgrade plan (Free limit blocks extra cron services)
- [ ] `aegis-api` redeployed from latest `main` (lookup + migration 027 + 028)
- [ ] `aegis-witness-worker` running
- [ ] `WITNESS_INTERVAL_MS=60000` for demos (3600000 OK for cost, slower inclusion verify)
- [ ] Optional: compliance + housekeeping cron services (see `docs/RAILWAY_AEGIS_DEPLOY.md`)
- [ ] Migration **026** applied (worker run history in Platform Ops)

## Deploy

- [ ] Push `lan-dry/xyz` main → Railway + Vercel auto-deploy
- [ ] Console: `app.salanor.com` — dashboard strip shows Merkle roots + service status
- [ ] Marketing: `www.salanor.com/trust` and **`/pricing`** live
- [ ] Docs: integration guides (n8n, LangGraph, CrewAI)

## Billing (before quoting Team)

- [ ] Stripe Team price created ($299/mo) → Platform Ops → Plans → Team → price ID
- [ ] Console billing page shows upgrade when checkout configured
- [ ] Enterprise deals: Platform Ops manual invoice flow tested

## Google Search Console

- [ ] Submit sitemap: `https://www.salanor.com/sitemap.xml`
- [ ] Request indexing for `/trust`, `/pricing`, `/products/aegis`, `/legal/fedramp` after deploy

## LinkedIn launch

- [ ] Post: JMT-S trace screenshot + "who approved the publish?" hook
- [ ] Link: `salanor.com/products/aegis` + `salanor.com/pricing` + `salanor.com/trust`
- [ ] CTA: book via `/contact`

## Demo assets

- [ ] `examples/n8n/DEMO_SCRIPT.md` — 60s script + failure path note
- [ ] `examples/n8n/JMTS_AEGIS_SETUP.md` — technical setup
