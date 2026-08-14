# Production readiness (Tier 1–3)

Use this alongside `GO_LIVE_CHECKLIST.md` before prospecting, LinkedIn, and live demos.

## Tier 1 — Before heavy prospecting (do now)

| Item | Status | Notes |
|------|--------|-------|
| Trace lifecycle (`executing` status) | Done | Migration **027** |
| Workflow run lookup API | Done | `GET /v1/aegis/workflows/runs/lookup?external_system=n8n&external_execution_id=…` |
| Plan limits aligned to pricing | Ops UI | Platform Ops → Plans (not migration) |
| Export monthly cap schema | Done | Migration **028** (`compliance_export.created_at`) |
| Governed n8n demo (success path) | Verify | Manual or **production webhook** → approve → COMPLETED |
| Governed n8n demo (failure path) | Verify | Production webhook only (not Manual Trigger) → error workflow → FAILED |
| Railway: `aegis-api` on latest `main` | Deploy | Redeploy if stuck on old commit — see `RAILWAY_AEGIS_DEPLOY.md` |
| Railway: witness worker | Deploy | `pnpm --filter aegis-api witness:worker`, `WITNESS_INTERVAL_MS=60000` |
| Railway: Hobby plan | Upgrade | Free tier blocks extra cron services |
| Marketing `/pricing` live | Deploy | Vercel `web-marketing` |
| Trust page honest claims | Live | `/trust` — no SOC 2 cert oversell |

### Demo org hygiene

- Close or ignore stale **EXECUTING** traces from pre-fix manual runs; housekeeping fails them after 24h.
- Use a fresh org or clean trace list for customer demos.

### Credentials (JMT-S workflow)

| Credential | Nodes |
|------------|-------|
| **Salanor Aegis API** | 7b Check Policy, 11 Record Run, error handler Record failure |
| **Header Auth (ingest Bearer)** | Error handler Lookup only |
| **JMT-S Agent API** | CMS nodes (1, 6, 8) |

---

## Tier 2 — First paying customers (2–4 weeks)

| Item | Status | Notes |
|------|--------|-------|
| Self-serve signup → org → key → first trace | Test | `SELF_SERVE_SIGNUP_ENABLED=1` |
| Stripe Team checkout | Configure | Create Product + Price ($299/mo), paste `stripe_price_id` in Platform Ops → Plans — **or invoice-only if Stripe unsupported in Salanor's country** (see `BILLING_AND_PLANS.md`) |
| Billing portal | Configure | `STRIPE_*` + `BILLING_API_URL` on console deploy |
| Approval notifications | Verify | Resend + optional Slack webhook |
| Compliance export limits (Free) | Done | 2 exports/month; Team+ unlimited |
| Scheduled exports (Team+) | Done | Gated on Free |
| Platform Ops provisioning | Ready | `ops.salanor.com` — orgs, plans, manual invoice |
| Customer one-pager | Use | `/products/aegis` + `/pricing` + `/trust` |

### Stripe quick setup

1. Stripe Dashboard → Product **Aegis Team** → Price **$299/month** recurring.
2. Platform Ops → Plans → Team → paste Price ID (`price_…`).
3. Deploy `services/billing` with `STRIPE_SECRET_KEY`, webhook to `/v1/billing/webhooks/stripe`.
4. Console: `BILLING_API_URL` + proxy in `web-console/next.config.ts` (already wired).

See `docs/BILLING_AND_PLANS.md` for full sales playbook.

---

## Tier 3 — Do not oversell (roadmap)

| Claim | Honest line |
|-------|-------------|
| SOC 2 Type II | Export mapping live; **Salanor certification** target Q4 2026 |
| FedRAMP | Architecture path; not authorized today |
| EU AI Act | Control themes in exports; not legal certification |
| Insurance / Aether | Preview only in console sidebar |
| GCP BYOK pilot | Pilot — see trust page |

Keep deck and LinkedIn aligned with `/trust` status badges.

---

## Deploy map

| Surface | Repo / host |
|---------|-------------|
| API + workers | `lan-dry/xyz` → Railway |
| Console | Vercel → `app.salanor.com` |
| Marketing | Vercel → `www.salanor.com` |
| Platform Ops | Vercel → `ops.salanor.com` |
| Docs | Vercel → `docs.salanor.com` |

---

## Demo assets

- `examples/n8n/DEMO_SCRIPT.md` — 60s + 10min
- `examples/n8n/JMTS_AEGIS_SETUP.md` — Publish, webhook, credentials
- `examples/n8n/jmt-s-content-sync-with-aegis.json` — main workflow
- `examples/n8n/jmt-s-aegis-error-handler.json` — global error workflow

## Further reading

- `docs/ROADMAP.md` — live vs in-product vs external programs
- `docs/SOC2_READINESS.md` — auditor checklist mapped to Aegis exports
- `docs/BILLING_AND_PLANS.md` — tiers, invoice billing, non-Stripe regions
