# Salanor command reference

All commands run from the **repository root** unless noted. Requires Node 22+, pnpm 9+, and a configured `.env` (copy from `.env.example`).

**Interactive (staff):** Platform Ops → **Commands** (`http://localhost:3003/commands`) — searchable reference with roles explained.

**Related:** [DEV.md](./DEV.md) (setup), [PLATFORM_OPS.md](../docs-internal/PLATFORM_OPS.md) (internal admin), [E2E_PARTNER_ONBOARDING.md](./E2E_PARTNER_ONBOARDING.md) (partner flow), [tools/demo/README.md](../tools/demo/README.md) (demo details).

---

## Quick start (local dev)

| Step | Command |
|------|---------|
| Infrastructure | `docker compose up -d` |
| Schema + seed | `pnpm db:migrate` then `pnpm db:seed` |
| All apps | `pnpm dev` |
| Console | http://localhost:3000 — login `dev@salanor.local` + `DEV_CONSOLE_PASSWORD_ORG_A` |

---

## 1. Development — daily

| Command | What it does |
|---------|----------------|
| `pnpm install` | Install workspace dependencies |
| `pnpm dev` | Console, marketing, docs, aegis-api, id, insurance-api (parallel) |
| `pnpm dev:console` | Web console only (`:3000`) |
| `pnpm dev:marketing` | Marketing site (`:3001`) |
| `pnpm dev:docs` | Docs site (`:3002`) |
| `pnpm dev:id` | Salanor ID auth service (`:8091`) — **required for login** |
| `pnpm --filter aegis-api dev` | Aegis API only (`:8080`) |
| `pnpm dev:insurance` | Insurance API (`:8092`) |
| `pnpm lint` | ESLint across monorepo |
| `pnpm typecheck` | TypeScript check |
| `pnpm test` | All package tests |
| `pnpm build` | Production builds |

**Health checks**

```bash
curl http://127.0.0.1:8080/health    # aegis-api
curl http://127.0.0.1:8091/health    # salanor-id
curl http://127.0.0.1:8092/health    # insurance-api
```

---

## 2. Database

| Command | What it does | When |
|---------|----------------|------|
| `pnpm db:migrate` | Apply pending SQL migrations | After pull, fresh DB |
| `pnpm db:migrate:down` | Roll back one migration generation | Dev only — **destructive** |
| `pnpm db:seed` | Run `tools/seed/dev.sql` (idempotent) | Reset dev data |

**Warning:** Integration tests that run `migrate down` against your `DATABASE_URL` will **wipe data**. Use a separate DB for tests in production-like environments.

---

## 3. Demo & client walkthrough (testing)

Prerequisites: `pnpm db:migrate`, `pnpm db:seed`, `pnpm --filter aegis-api dev` running.

| Command | What it does |
|---------|----------------|
| `pnpm demo:ingest` | Sign + ingest one APS event |
| `pnpm demo:verify-chain` | Verify hash chain for org events |
| `pnpm demo:verify-inclusion <event_id>` | Verify Merkle inclusion for one event |
| `pnpm demo:proxy` | SDK proxy allow/deny demo |
| `pnpm witness:batch` | Build Merkle witness roots from events |
| `pnpm transparency:publish` | Publish witness proofs to transparency log |
| `pnpm verifier:public -- --org dev-org --event <event_id>` | Third-party public verification (HTTP only) |
| `pnpm demo:full-system` | **Full pipeline** — proxy, approval, witness, verifier, export, SIEM |

### Demo environment variables

Set in repo root `.env` (see `tools/demo/README.md`):

| Variable | Purpose |
|----------|---------|
| `DEMO_ORGANIZATION_ID` | Target org UUID |
| `DEMO_ORGANIZATION_SLUG` | e.g. `dev-org` (public URLs) |
| `DEMO_AGENT_ID` / `DEMO_KEY_ID` | Signing identity |
| `DEV_SIGNING_PRIVATE_KEY_B64` | Private key for demos |
| `AEGIS_INGEST_DEV_KEY` | Ingest API secret for that org |

After **Provision org** or **Agents → Create**, copy values from the UI / `sdk_config` panel.

### Partner onboarding E2E

```bash
pnpm pilot:e2e
# or: node tools/scripts/e2e-onboarding.mjs
```

See [E2E_PARTNER_ONBOARDING.md](./E2E_PARTNER_ONBOARDING.md).

### Release gate (pilot)

Before a partner release, CI and local runs should pass:

```bash
pnpm demo:full-system   # needs aegis-api + migrate + seed
pnpm pilot:e2e          # needs aegis-api + id + PLATFORM_BOOTSTRAP_SECRET
```

Checklist: [PILOT_RELEASE_CHECKLIST.md](./PILOT_RELEASE_CHECKLIST.md).

### Public verification (browser)

| URL | Purpose |
|-----|---------|
| `http://localhost:3000/verify?org=dev-org&event=<event_id>` | Merkle + transparency checks (no login) |
| `pnpm verifier:public -- --org dev-org --event <event_id>` | Same checks via CLI |

Marketing home links to the console `/verify` page.

### Approval notifications (v1.5)

When the SDK creates a pending approval, optional channels notify admins:

| Variable | Effect |
|----------|--------|
| `APPROVAL_SLACK_WEBHOOK_URL` | Slack message with link to console |
| `RESEND_API_KEY` | Email org admins (or `APPROVAL_NOTIFY_EMAIL` override) |

Approve/reject still happens in **Console → Approvals** (`/aegis/approvals?focus=<approval_id>`).

---

## 4. Compliance exports (P1.5 / P2)

| Command | What it does | Who runs it |
|---------|----------------|-------------|
| **Console → Exports** | Create one-time ZIP; enable monthly schedule | Admin user |
| `pnpm compliance:worker` | Process `pending` exports + run due schedules | **Ops / cron** |
| `pnpm compliance:schedule` | Run **only** due monthly schedules | **Ops / cron (daily)** |

### What `pnpm compliance:schedule` does

1. Finds orgs with **monthly auto-export enabled** and `next_run_at <= now`.
2. Creates an export for the **previous calendar month**.
3. Builds the ZIP (events, policies, control mapping, SOC 2 Type I report, etc.).
4. Updates schedule `last_run_at` / `next_run_at`.

The console toggle **does not** run this by itself — you must schedule the command on the server.

### Server storage

| Variable | Default | Notes |
|----------|---------|--------|
| `COMPLIANCE_EXPORT_DIR` | `./.data/compliance-exports` | API writes ZIPs here before download |

Users download via **Download** in the console (browser save dialog).

### Suggested production cron

```bash
# Daily at 06:00 UTC — process pending + monthly schedules
0 6 * * * cd /opt/salanor && pnpm compliance:worker >> /var/log/salanor-compliance.log 2>&1
```

Or split:

```bash
0 6 * * * cd /opt/salanor && pnpm compliance:schedule
15 6 * * * cd /opt/salanor && pnpm compliance:worker
```

---

## 5. Witness & transparency

| Command | What it does |
|---------|----------------|
| `pnpm witness:batch` | Batch events into `merkle_root` + `inclusion_proof` |
| `pnpm transparency:publish` | Append transparency log entries for published roots |

Console: open event → **Verify chain + inclusion**.

---

## 6. Production / staging operations

| Task | Approach |
|------|----------|
| Deploy API + ID + console | Your host (Vercel, Fly, K8s, etc.) — set env from `.env.example` |
| Migrations | `pnpm db:migrate` in release pipeline **before** traffic |
| **Never** run `db:seed` | Production data only |
| Compliance ZIPs | `COMPLIANCE_EXPORT_DIR` on persistent volume |
| Monthly exports | Cron: `pnpm compliance:schedule` or `compliance:worker` |
| Witness batch | Cron: `pnpm witness:batch` (frequency per SLA) |
| Secrets | `DATABASE_URL`, ingest keys, `PLATFORM_BOOTSTRAP_SECRET`, `RESEND_API_KEY` |

### Important production env

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres |
| `SESSION_COOKIE_DOMAIN` | e.g. `.salanor.com` for shared login |
| `CONSOLE_ORIGIN` / `PLATFORM_ORIGIN` / `MARKETING_ORIGIN` | CORS (console, Platform Ops, marketing) |
| `SALANOR_ID_URL` | Product APIs validate sessions via ID |
| `RESEND_API_KEY` | Invite + password reset email |
| `PLATFORM_BOOTSTRAP_SECRET` | Provision org API (automation) |
| `NEXT_PUBLIC_PLATFORM_URL` | Platform Ops app (`http://localhost:3003`) |

---

## 7. Integration tests (CI / local)

```bash
pnpm --filter aegis-api test
```

Requires `DATABASE_URL` pointing at Postgres. Prefer a **dedicated test database**, not your personal dev DB.

---

## 8. Command cheat sheet by scenario

| Scenario | Commands |
|----------|----------|
| **First day on repo** | `docker compose up -d` → `pnpm install` → `pnpm db:migrate` → `pnpm db:seed` → `pnpm dev` |
| **Client demo in 15 min** | `pnpm demo:ingest` → console Traces → verify event → Policies → Exports → download ZIP |
| **Full proof story** | `pnpm demo:full-system` |
| **Reset dev login** | `pnpm db:seed` (clears password hashes for dev accounts) |
| **Monthly auditor bundle** | Enable schedule in console → cron `pnpm compliance:schedule` |
| **Third-party verify** | `pnpm verifier:public -- --org <slug> --event <id>` |

---

## 9. Backlog (not yet built)

See **[docs-internal/REMAINING_WORK.md](../docs-internal/REMAINING_WORK.md)** for open work (P2+, infra, Stripe go-live config).

---

## Document history

| Date | Change |
|------|--------|
| 2026-05-21 | §9 points to docs-internal/REMAINING_WORK.md |
| 2026-05-22 | Initial command reference (dev, demo, compliance, production) |
