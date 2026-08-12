# Go-live checklist (prospecting)

## Product demo path ✅

- [ ] Import `examples/n8n/jmt-s-content-sync-with-aegis.json` (governed)
- [ ] Policy active: `jmts.content.publish` → **require approval**
- [ ] Salanor Aegis credential on node **7b**; ingest credential on node **11**
- [ ] Run manual trigger → approve in Console → trace COMPLETED
- [ ] Replay + Verify chain + inclusion on publish event

## Railway (move to Hobby)

- [ ] Upgrade plan (Free limit blocks extra cron services)
- [ ] `aegis-api` + `aegis-witness-worker` running
- [ ] `WITNESS_INTERVAL_MS=60000` for demos (3600000 OK for cost, slower inclusion verify)
- [ ] Optional: compliance + housekeeping cron services (see `docs/RAILWAY_AEGIS_DEPLOY.md`)

## Deploy

- [ ] Push `lan-dry/xyz` main → Railway + Vercel auto-deploy
- [ ] Console: `app.salanor.com` — dashboard strip shows Merkle roots + service status
- [ ] Marketing: `www.salanor.com/trust` live

## Google Search Console

- [ ] Submit sitemap: `https://www.salanor.com/sitemap.xml`
- [ ] **12 indexed / 8 not indexed** is normal for a new site
- [ ] Fix 404s: validate `/product`, `/demo`, `/auth/*` redirect (already in next.config)
- [ ] Request indexing for `/trust`, `/products/aegis`, `/legal/fedramp` after deploy
- [ ] "Crawled – not indexed": often thin pages (`/blog`, `/careers`) — add content or noindex later

## LinkedIn launch

- [ ] Post: JMT-S trace screenshot + "who approved the publish?" hook
- [ ] Link: `salanor.com/products/aegis` + `salanor.com/trust`
- [ ] CTA: book via `/contact`

## Demo assets

- [ ] `examples/n8n/DEMO_SCRIPT.md` — 60s script
- [ ] `examples/n8n/JMTS_AEGIS_SETUP.md` — technical setup
