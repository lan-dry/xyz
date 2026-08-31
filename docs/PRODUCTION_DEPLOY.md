# Production deployment runbook

**Version:** 1.0 · **August 2026** · **Owner:** Salanor Ltd

This is the single source of truth for deploying Salanor and Aegis to production. A new engineer should be able to follow this document without reading the rest of the repo first.

**Related docs:** `INFRASTRUCTURE_DECISIONS.md` (architecture choices), `GO_LIVE_CHECKLIST.md` (demo readiness), `BILLING_AND_PLANS.md` (Stripe and invoicing), `.env.example` (local dev reference).

---

## Table of contents

1. [Architecture at a glance](#1-architecture-at-a-glance)
2. [Why these vendors](#2-why-these-vendors)
3. [Database: why Neon](#3-database-why-neon)
4. [File storage on Fly.io](#4-file-storage-on-flyio)
5. [Domains and URLs](#5-domains-and-urls)
6. [Accounts to create](#6-accounts-to-create)
7. [Git and source of truth](#7-git-and-source-of-truth)
8. [Phase 1: Neon Postgres](#8-phase-1-neon-postgres)
9. [Phase 2: Fly.io backends](#9-phase-2-flyio-backends)
10. [Phase 3: Vercel frontends](#10-phase-3-vercel-frontends)
11. [Environment variables (full list)](#11-environment-variables-full-list)
12. [First boot: migrations and demo org](#12-first-boot-migrations-and-demo-org)
13. [n8n (workflow demos)](#13-n8n-workflow-demos)
14. [Secrets management](#14-secrets-management)
15. [Deploy workflow (day to day)](#15-deploy-workflow-day-to-day)
16. [Health checks](#16-health-checks)
17. [Retiring the old xyz deploy mirror](#17-retiring-the-old-xyz-deploy-mirror)
18. [Handoff guide for a new ops owner](#18-handoff-guide-for-a-new-ops-owner)
19. [When to move compute to AWS](#19-when-to-move-compute-to-aws)
20. [Cost estimate](#20-cost-estimate)
21. [Troubleshooting](#21-troubleshooting)

---

## 1. Architecture at a glance

```
                         CUSTOMERS / PROSPECTS
                                    |
        +---------------------------+---------------------------+
        |                           |                           |
   www.salanor.com            app.salanor.com            docs.salanor.com
   (marketing)                (console)                    (docs)
        |                           |                           |
        +---------------------------+---------------------------+
                                    |
                              VERCEL (4 Next.js apps)
                                    |
                    server-side proxies (/api/* rewrites)
                                    |
        +---------------------------+---------------------------+
        |                           |                           |
  api.salanor.com              id.salanor.com           billing.salanor.com
  (aegis-api)                  (salanor-id)              (billing)
        |                           |                           |
        +---------------------------+---------------------------+
                                    |
                           FLY.IO (containers)
                                    |
                    +---------------+---------------+
                    |                               |
              NEON POSTGRES                  Fly volumes (/data)
              (Frankfurt, EU)                compliance export ZIPs
                    |
        +-----------+-----------+
        |                       |
  witness worker          compliance + housekeeping
  (always on)             (scheduled cron)
```

**Not in this diagram but part of production:**

| Component | Host | Domain |
|-----------|------|--------|
| Platform Ops (staff admin) | Vercel | `ops.salanor.com` |
| Insurance API (preview product) | Fly.io | `insurance.salanor.com` |
| n8n (demo workflows) | Fly.io Docker | `n8n.salanor.com` (optional) |
| Email | Resend | (no public domain) |
| DNS / TLS | Cloudflare | `salanor.com` zone |

---

## 2. Why these vendors

This stack is chosen for **long-term** use with bank and insurance prospects, not as a temporary startup setup.

| Layer | Vendor | Role |
|-------|--------|------|
| Frontends | **Vercel** | Next.js apps: marketing, console, ops, docs |
| Backends | **Fly.io** | Node APIs, background workers, cron, optional n8n |
| Database | **Neon** | Managed Postgres (EU region) |
| Export files (now) | **Fly volumes** | ZIP staging on disk |
| Export files (later) | **Cloudflare R2** | Object storage when volume grows |
| Email | **Resend** | Invites, approvals, contact form |
| Secrets | **Doppler** (recommended) | Central secret store |
| Errors | **Sentry** (optional) | Production error tracking |

**What we deliberately do not use as the primary long-term stack:**

| Vendor | Why not primary |
|--------|-----------------|
| Railway | Fine for experiments; per-service cost adds up; less common in enterprise vendor reviews than Fly or AWS |
| Railway Postgres | Locks database to one host; harder to migrate |
| Vercel for backends | No long-running witness worker; wrong tool for APIs |
| Single VPS | You become full-time sysadmin; weak story for SOC 2 vendor pack |
| AWS on day one | Best for large enterprise mandates, but heavy setup for a solo founder; Fly uses the same containers and can move to AWS later |

---

## 3. Database: why Neon

### Short answer

**Yes, Neon is the recommended database for Salanor production.** Fly.io and Vercel both connect to Neon over the network. The database is **separate from compute**, so you can change hosting without losing data.

### Comparison

| Option | Verdict | Notes |
|--------|---------|-------|
| **Neon Postgres** | **Recommended** | Standard Postgres. EU region (Frankfurt). Branching for staging. Point-in-time recovery. Easy `pg_dump` exit. SOC 2 available. Matches `INFRASTRUCTURE_DECISIONS.md`. |
| Fly Postgres | Acceptable | Simpler if everything stays on Fly, but less mature branching, ties backups to Fly account |
| Railway Postgres | Avoid long-term | Convenient at first, hard to move later |
| Supabase Postgres | Overkill | Extra auth and realtime features you do not use; more coupling |
| AWS RDS | Enterprise later | Best when a contract names AWS; more ops work and cost now |
| PlanetScale | No | MySQL, not Postgres. Your migrations are Postgres SQL. |
| Self-hosted Postgres on a VPS | Avoid | Backup and HA become your problem |

### Neon settings for Salanor

| Setting | Value |
|---------|-------|
| Region | **EU Central (Frankfurt)** for EU data residency story |
| Postgres version | 16 |
| Database name | `aegis` (or `salanor_aegis`) |
| Pooling | Use Neon **pooled** connection string for apps |
| Migrations | Use **direct** (unpooled) connection string when running `pnpm db:migrate` |

### Connection strings

Neon gives two URLs. Use both:

| URL type | Used by |
|----------|---------|
| Pooled (`-pooler` in host) | All Fly.io and Vercel runtime apps |
| Direct (no pooler) | Migration CLI, one-off admin scripts |

Store both in Doppler as `DATABASE_URL` (pooled) and `DATABASE_URL_DIRECT` (direct).

---

## 4. File storage on Fly.io

### Does Fly allow file storage?

**Yes.** Fly.io has **Volumes**: persistent disks you attach to a machine.

### How we use it today

Compliance export ZIPs are written to disk before the user downloads them from the console.

| Setting | Value |
|---------|-------|
| Fly volume name | `compliance_exports` |
| Mount path on machine | `/data` |
| Env var | `COMPLIANCE_EXPORT_DIR=/data/compliance-exports` |
| Attached to | `salanor-aegis-api` and `salanor-aegis-compliance` (same region) |

### Create a volume (once per app)

```bash
fly volumes create compliance_exports --region fra --size 1 -a salanor-aegis-api
fly volumes create compliance_exports --region fra --size 1 -a salanor-aegis-compliance
```

Size `1` means 1 GB. Increase later if export volume grows.

### Limits you should know

| Limit | Detail |
|-------|--------|
| Region | Volume and machine must be in the **same Fly region** (we use `fra`) |
| Replication | Fly volumes are not multi-region by default |
| Backup | Take your own backup strategy for export ZIPs; critical audit data also lives in Postgres event rows |
| Scale-out | One volume attaches to one machine; fine for current scale |

### Long-term path: Cloudflare R2

When export storage grows or you need cheaper long-term retention, move ZIP blobs to **Cloudflare R2** (S3-compatible). Your infrastructure doc already lists R2 as the object storage target. That is a code change in `aegis-api` storage layer, not a full replatform.

**For meetings next week:** Fly volume is enough. You do not need R2 on day one.

---

## 5. Domains and URLs

| Public URL | Service | Platform |
|------------|---------|----------|
| `https://www.salanor.com` | Marketing | Vercel |
| `https://app.salanor.com` | Customer console | Vercel |
| `https://ops.salanor.com` | Platform Ops (staff) | Vercel |
| `https://docs.salanor.com` | Documentation | Vercel |
| `https://api.salanor.com` | Aegis API | Fly.io |
| `https://id.salanor.com` | Salanor ID (auth) | Fly.io |
| `https://billing.salanor.com` | Billing API | Fly.io |
| `https://insurance.salanor.com` | Insurance API | Fly.io |
| `https://n8n.salanor.com` | n8n (optional) | Fly.io |

DNS: point CNAME records to Vercel and Fly as each platform instructs after you add custom domains.

---

## 6. Accounts to create

Use **`engineering@salanor.com`** (Google Workspace) as the owner email where possible.

| Service | URL | Plan |
|---------|-----|------|
| Neon | https://neon.tech | Scale (production) |
| Fly.io | https://fly.io | Pay as you go |
| Vercel | https://vercel.com | Pro or Team for org repo |
| Resend | https://resend.com | Free tier OK to start |
| Doppler | https://doppler.com | Free tier OK to start |
| Sentry | https://sentry.io | Optional |
| Cloudflare | https://cloudflare.com | DNS for salanor.com |
| GitHub | salanor-ltd org | Repo access |

---

## 7. Git and source of truth

| Item | Value |
|------|-------|
| Source repo | `github.com/salanor-ltd/salanor` (private) |
| Branch | `main` |
| Deploy configs | `deploy/fly/*/fly.toml`, `deploy/docker/Dockerfile.backend` |

**Stop using** the public mirror `lan-dry/xyz` for production. See [section 17](#17-retiring-the-old-xyz-deploy-mirror).

---

## 8. Phase 1: Neon Postgres

### Step 1: Create project

1. Log in to Neon as `engineering@salanor.com`
2. New project: **Salanor Production**
3. Region: **AWS EU Central 1 (Frankfurt)**
4. Postgres 16

### Step 2: Save connection strings

Copy from Neon dashboard:

- `DATABASE_URL` (pooled, for apps)
- `DATABASE_URL_DIRECT` (direct, for migrations)

### Step 3: Run migrations (from your laptop or CI)

```bash
cd salanor
pnpm install

# Set direct URL for migrations only
set DATABASE_URL=postgresql://...direct-connection-string...
pnpm db:migrate
```

**Never run `pnpm db:seed` in production.** Seed is for local dev only.

### Step 4: Optional staging branch

Neon can create a **branch** for staging previews. Name it `staging`. Use its connection string on a staging Fly app or Vercel preview when you need parity testing.

---

## 9. Phase 2: Fly.io backends

### Prerequisites

Install Fly CLI: https://fly.io/docs/flyctl/install/

```bash
fly auth login
```

### Apps to create

| Fly app name | Config file | Public domain |
|--------------|-------------|---------------|
| `salanor-aegis-api` | `deploy/fly/aegis-api/fly.toml` | `api.salanor.com` |
| `salanor-id` | `deploy/fly/salanor-id/fly.toml` | `id.salanor.com` |
| `salanor-billing` | `deploy/fly/billing/fly.toml` | `billing.salanor.com` |
| `salanor-insurance-api` | `deploy/fly/insurance-api/fly.toml` | `insurance.salanor.com` |
| `salanor-aegis-witness` | `deploy/fly/aegis-witness/fly.toml` | (no public URL) |
| `salanor-aegis-compliance` | `deploy/fly/aegis-compliance/fly.toml` | (no public URL) |
| `salanor-aegis-housekeeping` | `deploy/fly/aegis-housekeeping/fly.toml` | (no public URL) |

### First-time create and deploy (example: aegis-api)

From repository root:

```bash
# Create app (once)
fly apps create salanor-aegis-api --org personal

# Create volume (once)
fly volumes create compliance_exports --region fra --size 1 -a salanor-aegis-api

# Set secrets (see section 11 for full list)
fly secrets set DATABASE_URL="postgresql://..." -a salanor-aegis-api
fly secrets set CONSOLE_ORIGIN="https://app.salanor.com" -a salanor-aegis-api
# ... set all required secrets

# Deploy
fly deploy --config deploy/fly/aegis-api/fly.toml

# Add custom domain
fly certs add api.salanor.com -a salanor-aegis-api
```

Repeat for each app with its own secrets and domain.

### Deploy order (first production boot)

Do this order so dependencies resolve:

1. Neon migrations applied
2. `salanor-id` (auth)
3. `salanor-aegis-api` (main API)
4. `salanor-aegis-witness` (witness loop)
5. `salanor-billing`
6. `salanor-insurance-api`
7. `salanor-aegis-compliance` + schedule
8. `salanor-aegis-housekeeping` + schedule

### Schedule cron workers on Fly

Compliance and housekeeping run once per invocation then exit. Schedule them on Fly:

```bash
# After first deploy of each cron app, set schedule on its machine:
# Daily 06:00 UTC
fly machine list -a salanor-aegis-compliance
fly machine update <MACHINE_ID> --schedule "0 6 * * *" -a salanor-aegis-compliance

# Hourly
fly machine list -a salanor-aegis-housekeeping
fly machine update <MACHINE_ID> --schedule "0 * * * *" -a salanor-aegis-housekeeping
```

Docs: https://fly.io/docs/launch/schedule-tasks/

### Witness worker

The witness app has **no HTTP port**. It runs `pnpm --filter aegis-api witness:worker` in a loop.

| Env var | Recommended value |
|---------|-------------------|
| `WITNESS_INTERVAL_MS` | `60000` for demos (1 minute). `3600000` (1 hour) for lower cost in steady state. |

---

## 10. Phase 3: Vercel frontends

Import **`salanor-ltd/salanor`** (private). Create **four projects**:

| Vercel project | Root directory | Domain |
|----------------|----------------|--------|
| salanor-marketing | `apps/web-marketing` | `www.salanor.com` |
| salanor-console | `apps/web-console` | `app.salanor.com` |
| salanor-platform | `apps/web-platform` | `ops.salanor.com` |
| salanor-docs | `apps/web-docs` | `docs.salanor.com` |

Each project already has a `vercel.json` with monorepo install and build commands.

### Vercel build settings (defaults from vercel.json)

| Setting | Value |
|---------|-------|
| Framework | Next.js |
| Install | `cd ../.. && pnpm install` |
| Build | `cd ../.. && pnpm --filter @salanor/web-console build` (change filter per app) |

### Production deploy trigger

Push to `main` on `salanor-ltd/salanor` auto-deploys when Git integration is enabled.

---

## 11. Environment variables (full list)

Generate new production secrets. Do not copy dev values from `.env.example`.

```bash
# AUTH_SECRET (32 bytes hex)
openssl rand -hex 32

# PLATFORM_BOOTSTRAP_SECRET, AEGIS_BRIDGE_MASTER_KEY
openssl rand -base64 48
```

### Shared across many services

```env
NODE_ENV=production
SESSION_COOKIE_DOMAIN=.salanor.com

PUBLIC_SITE_URL=https://www.salanor.com
NEXT_PUBLIC_CONSOLE_URL=https://app.salanor.com
NEXT_PUBLIC_MARKETING_URL=https://www.salanor.com
NEXT_PUBLIC_DOCS_BASE_URL=https://docs.salanor.com
NEXT_PUBLIC_PLATFORM_URL=https://ops.salanor.com

CONSOLE_ORIGIN=https://app.salanor.com
MARKETING_ORIGIN=https://www.salanor.com
PLATFORM_ORIGIN=https://ops.salanor.com

AEGIS_API_URL=https://api.salanor.com
NEXT_PUBLIC_AEGIS_API_URL=https://api.salanor.com
SALANOR_ID_URL=https://id.salanor.com
INSURANCE_API_URL=https://insurance.salanor.com
BILLING_API_URL=https://billing.salanor.com
CONSOLE_PUBLIC_URL=https://app.salanor.com
```

### salanor-aegis-api (Fly secrets)

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Neon pooled URL |
| `CONSOLE_ORIGIN` | Yes | CORS |
| `MARKETING_ORIGIN` | Yes | CORS |
| `SALANOR_ID_URL` | Yes | Session validation |
| `CONSOLE_PUBLIC_URL` | Yes | Workflow Bridge links |
| `DEV_SIGNING_PRIVATE_KEY_B64` | Yes* | Platform signing until BYOK per org |
| `AEGIS_BRIDGE_MASTER_KEY` | Yes | Workflow Bridge (n8n) |
| `COMPLIANCE_EXPORT_DIR` | Yes | `/data/compliance-exports` |
| `RESEND_API_KEY` | Yes | Approval emails |
| `INVITE_EMAIL_FROM` | Yes | e.g. `Salanor <invites@salanor.com>` |
| `APPROVAL_NOTIFY_EMAIL` | Recommended | Comma-separated |
| `APPROVAL_SLACK_WEBHOOK_URL` | Optional | |
| `TWILIO_ACCOUNT_SID` | Optional | SMS approvals |
| `TWILIO_AUTH_TOKEN` | Optional | |
| `TWILIO_FROM_NUMBER` | Optional | |
| `INGEST_RATE_LIMIT_PER_MIN` | Optional | Default 300 |
| `SENTRY_DSN` | Optional | |
| `DEMO_ORGANIZATION_ID` | Demo only | Not required for prod |

### salanor-id (Fly secrets)

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Neon pooled URL |
| `CONSOLE_ORIGIN` | Yes | OAuth callbacks |
| `PLATFORM_ORIGIN` | Yes | Ops CORS |
| `MARKETING_ORIGIN` | Yes | Contact CORS |
| `AUTH_SECRET` | Yes | OAuth state / sessions |
| `PLATFORM_BOOTSTRAP_SECRET` | Yes | Org provisioning API |
| `RESEND_API_KEY` | Yes | |
| `INVITE_EMAIL_FROM` | Yes | |
| `EMAIL_FROM` | Recommended | Contact and system mail |
| `CONTACT_NOTIFY_EMAIL` | Recommended | |
| `CONTACT_IP_SALT` | Recommended | Random string |
| `SELF_SERVE_SIGNUP_ENABLED` | Yes | `1` |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | Optional | Console OAuth |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Optional | |
| `WORKOS_API_KEY` / `WORKOS_CLIENT_ID` | Optional | Enterprise SSO |
| `SSO_WORKOS_ORG_MAP` | Optional | JSON map |
| `LOGIN_RATE_LIMIT` | Recommended | `20` |
| `LOGIN_RATE_WINDOW_MS` | Recommended | `900000` |

OAuth callback URLs to register at GitHub/Google:

- `https://app.salanor.com/api/id/auth/oauth/github/callback`
- `https://app.salanor.com/api/id/auth/oauth/google/callback`

### salanor-billing (Fly secrets)

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | |
| `CONSOLE_ORIGIN` | Yes | Stripe redirects |
| `STRIPE_SECRET_KEY` | When live | Skip if invoice-only |
| `STRIPE_WEBHOOK_SECRET` | When live | Endpoint: `/v1/billing/webhooks/stripe` |
| `BILLING_CHECKOUT_ENABLED` | Optional | `0` hides Stripe UI |

### salanor-insurance-api (Fly secrets)

| Variable | Required |
|----------|----------|
| `DATABASE_URL` | Yes |
| `CONSOLE_ORIGIN` | Yes |
| `SALANOR_ID_URL` | Yes |

### salanor-aegis-witness (Fly secrets)

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | |
| `WITNESS_INTERVAL_MS` | Yes | `60000` or `3600000` |

### salanor-aegis-compliance (Fly secrets)

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | |
| `COMPLIANCE_EXPORT_DIR` | Yes | `/data/compliance-exports` |

### salanor-aegis-housekeeping (Fly secrets)

| Variable | Required |
|----------|----------|
| `DATABASE_URL` | Yes |

### Vercel: salanor-console

| Variable | Required |
|----------|----------|
| All shared URLs above | Yes |
| `SESSION_COOKIE_DOMAIN` | Yes |
| `SELF_SERVE_SIGNUP_ENABLED` | Yes |
| `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` | Yes |
| `PLATFORM_BOOTSTRAP_SECRET` | Yes |
| `SENTRY_DSN` | Optional |

Do **not** put `DATABASE_URL` on Vercel console.

### Vercel: salanor-marketing

| Variable | Required |
|----------|----------|
| `NEXT_PUBLIC_MARKETING_URL` | Yes |
| `NEXT_PUBLIC_CONSOLE_URL` | Yes |
| `SALANOR_ID_URL` | Yes |
| `CONTACT_NOTIFY_EMAIL` | Recommended |
| `EMAIL_FROM` | Recommended |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Optional |

### Vercel: salanor-platform

| Variable | Required |
|----------|----------|
| `NEXT_PUBLIC_PLATFORM_URL` | Yes |
| `PLATFORM_ORIGIN` | Yes |
| `SALANOR_ID_URL` | Yes |
| `BILLING_API_URL` | Yes |
| `PLATFORM_BOOTSTRAP_SECRET` | Yes |
| `SESSION_COOKIE_DOMAIN` | Yes |

Staff accounts need `platform_staff` flag in Postgres (set via bootstrap or SQL).

### Vercel: salanor-docs

| Variable | Required |
|----------|----------|
| `NEXT_PUBLIC_DOCS_BASE_URL` | Yes |
| `NEXT_PUBLIC_DOCS_CONSOLE_URL` | Yes |
| `NEXT_PUBLIC_DOCS_MARKETING_URL` | Yes |
| `NEXT_PUBLIC_DOCS_API_URL` | Yes |

---

## 12. First boot: migrations and demo org

### Migrations

```bash
DATABASE_URL="<neon-direct-url>" pnpm db:migrate
```

Confirm latest migration applied (currently through `029_account_login_geo`).

### Create demo org (production)

Do **not** use `db:seed`. Instead:

1. Deploy `salanor-id` and `salanor-platform` + console
2. Log in to `ops.salanor.com` with a staff account
3. Platform Ops → Organizations → Provision a demo org
4. Create ingest key and policies in console for demo workflows

### Plan limits

Platform Ops → Plans. Set free / team / enterprise limits per `BILLING_AND_PLANS.md`.

### Enable Workflow Bridge

1. Set `AEGIS_BRIDGE_MASTER_KEY` on `salanor-aegis-api`
2. Console → Settings → enable Workflow Bridge
3. Configure n8n credential pointing to `https://api.salanor.com`

---

## 13. n8n (workflow demos)

For bank/insurance meetings, run payment smoke test workflows.

**Option A: n8n Cloud** (fastest, separate vendor)

**Option B: Fly.io Docker (self-hosted, long-term)**

Deploy official `n8nio/n8n` image as its own Fly app with a volume for credentials.

Env on n8n:

```env
N8N_HOST=n8n.salanor.com
N8N_PROTOCOL=https
WEBHOOK_URL=https://n8n.salanor.com/
N8N_ENCRYPTION_KEY=<random-secret>
AEGIS_API_URL=https://api.salanor.com
```

Install community node from `integrations/n8n-nodes-salanor-aegis`.

Import smoke test: `integrations/n8n-nodes-salanor-aegis/examples/smoke-test-with-error-trigger.json`

Policy: `app.payments.transfer` with max 1000 USD, require approval above limit.

---

## 14. Secrets management

**Do not** store production secrets in git or only in Fly/Vercel UI long term.

Recommended: **Doppler**

1. Create project **Salanor Production**
2. Add all variables from section 11
3. Sync to Fly (`doppler secrets upload` or Fly integration)
4. Sync to Vercel (Doppler integration)

Local dev keeps using `.env.local` (never committed).

---

## 15. Deploy workflow (day to day)

### Normal release

```bash
git checkout main
git pull origin main
# make changes, commit
git push origin main
```

| Component | What happens |
|-----------|--------------|
| Vercel apps | Auto-deploy on push to `main` |
| Fly backends | Auto-deploy if GitHub Actions configured, or manual `fly deploy` |

### Manual Fly deploy (one service)

```bash
fly deploy --config deploy/fly/aegis-api/fly.toml
```

### Database migration on release

Run **before** or **during** deploy when migrations exist:

```bash
DATABASE_URL="<neon-direct-url>" pnpm db:migrate
```

Never run `db:migrate:down` in production.

---

## 16. Health checks

After deploy, verify:

```bash
curl -f https://api.salanor.com/health
curl -f https://id.salanor.com/health
curl -f https://billing.salanor.com/health
curl -f https://insurance.salanor.com/health
```

Browser checks:

| URL | Expect |
|-----|--------|
| `https://www.salanor.com` | Marketing home |
| `https://app.salanor.com/login` | Console login |
| `https://ops.salanor.com` | Platform Ops (staff login) |
| `https://docs.salanor.com` | Docs home |

Workflow Bridge smoke test:

```bash
curl -X POST https://api.salanor.com/v1/aegis/workflows/runs \
  -H "Authorization: Bearer invalid" \
  -H "Content-Type: application/json" \
  -d '{"one_shot":true,"execution":{"nodes":[]}}'
```

Expect **401** (proves latest API is live).

---

## 17. Retiring the old xyz deploy mirror

Historical setup used public repo `lan-dry/xyz` because Vercel free tier pushed some founders to a public deploy mirror. **Production should not depend on it.**

### Migration steps

1. Connect Vercel and Fly to `salanor-ltd/salanor` (private)
2. Copy all env vars from old projects to new projects
3. Point DNS to new deployments
4. Verify health checks (section 16)
5. Archive or make private the `lan-dry/xyz` repo
6. Remove git remote: `git remote remove xyz`

### If xyz is still ahead on env vars

Compare Vercel project settings and Fly/Railway secrets against section 11. Copy anything missing into Doppler.

---

## 18. Handoff guide for a new ops owner

### What this system is

Salanor sells **Aegis**: audit trail and human approval for automated workflows in regulated industries. Production is a **monorepo** (`salanor-ltd/salanor`) with:

- 4 Next.js frontends on **Vercel**
- 4+ Node backends on **Fly.io**
- 1 Postgres database on **Neon**
- Background workers for Merkle witness, compliance exports, and housekeeping

### Key commands

| Task | Command |
|------|---------|
| Local dev | `docker compose up -d` then `pnpm db:migrate` then `pnpm dev` |
| Run migrations (prod) | `DATABASE_URL=<direct> pnpm db:migrate` |
| Deploy API | `fly deploy --config deploy/fly/aegis-api/fly.toml` |
| View API logs | `fly logs -a salanor-aegis-api` |
| Set secret | `fly secrets set KEY=value -a salanor-aegis-api` |
| SSH into machine | `fly ssh console -a salanor-aegis-api` |

### Where to look when things break

| Symptom | Check |
|---------|-------|
| Console 502 on login | `id.salanor.com/health`, Vercel `SALANOR_ID_URL` |
| Traces not ingesting | `api.salanor.com/health`, ingest key, Fly logs |
| Approvals not emailing | `RESEND_API_KEY`, Resend dashboard, Fly logs on aegis-api |
| Witness not updating | `fly logs -a salanor-aegis-witness`, `WITNESS_INTERVAL_MS` |
| Exports fail | Volume mounted? `COMPLIANCE_EXPORT_DIR`, compliance worker schedule |
| OAuth fails | Callback URLs, `AUTH_SECRET`, GitHub/Google app settings |

### Vendor SOC 2 reports (for customer questionnaires)

Download annually from:

- Vercel trust center
- Fly.io security / compliance page
- Neon security page
- Resend security page

List them in your vendor inventory (`COMPLIANCE_AND_ROADMAP.md`).

### Do not do in production

- `pnpm db:seed`
- `pnpm db:migrate:down`
- Commit secrets to git
- Run Prisma `db:push` against the Aegis database (destroys Aegis tables)

---

## 19. When to move compute to AWS

Stay on Fly.io + Neon until a **signed contract** or **RFP** requires AWS or a dedicated EU VPC.

| Trigger | Action |
|---------|--------|
| Customer mandates AWS | Container images move to ECS Fargate; Neon can stay or move to RDS Frankfurt |
| Customer mandates data never leaves EU | Confirm Neon Frankfurt + Fly `fra`; document in DPA |
| Very large export volume | Move ZIP storage to R2 or S3 |
| FedRAMP or agency path | Plan AWS GovCloud or authorized cloud (2027+ roadmap) |

Migration path: same Docker image, same Postgres dump, new host. Budget 1 to 3 days for a careful cutover, not months of rewrite.

---

## 20. Cost estimate

Approximate monthly cost at current scale (design partners, small team):

| Item | USD/month |
|------|-----------|
| Neon Scale (EU) | 19 to 69 |
| Fly.io (6 to 8 apps) | 40 to 90 |
| Vercel Pro | 20 |
| Resend | 0 to 20 |
| Doppler | 0 to 18 |
| n8n Cloud (optional) | 0 to 24 |
| **Total** | **80 to 200** |

Team plan revenue at $299/mo covers this with margin.

---

## 21. Troubleshooting

### Fly deploy fails on pnpm install

Ensure deploy runs from repo root context. Dockerfile copies full `packages/` and `services/`. Run locally:

```bash
docker build -f deploy/docker/Dockerfile.backend \
  --build-arg SERVICE_FILTER=aegis-api \
  --build-arg START_COMMAND="pnpm --filter aegis-api start" \
  --build-arg WITNESS_BUILD=1 \
  .
```

### Migrations fail on Neon

Use **direct** connection string, not pooled, for `pnpm db:migrate`.

### Console CORS errors

`CONSOLE_ORIGIN` on Fly APIs must exactly match `https://app.salanor.com` (no trailing slash mismatch).

### Session cookie not shared

Set `SESSION_COOKIE_DOMAIN=.salanor.com` on Vercel console and platform. Cookie must be `Secure` in production.

### Witness worker not running

```bash
fly status -a salanor-aegis-witness
fly logs -a salanor-aegis-witness
```

Machine must stay running (no auto-stop on worker app).

### Old Railway deploy still receiving traffic

Update DNS CNAME for `api.salanor.com` to point to Fly, not Railway. TTL may take up to 1 hour.

---

## Quick reference card

```
REPO:     github.com/salanor-ltd/salanor  branch main
DB:       Neon Postgres, EU Frankfurt, database aegis
APPS:     Vercel (4 frontends) + Fly.io (4 APIs + 3 workers)
SECRETS:  Doppler → Fly + Vercel
DEPLOY:   git push origin main; fly deploy --config deploy/fly/<service>/fly.toml
MIGRATE:  DATABASE_URL=<direct> pnpm db:migrate
DOCS:     this file + GO_LIVE_CHECKLIST.md + BILLING_AND_PLANS.md
```

**End of runbook.**
