# Partner onboarding — manual test guide

Step-by-step guide to test **new organization + users** and every console capability a customer would use.  
Automated API check: `node tools/scripts/e2e-onboarding.mjs` (from repo root).

**Last verified:** 2026-05-21 (invite, RBAC, keys, policies, audit logs via API).

---

## Before you start

### 1. Infrastructure

```bash
docker compose up -d
pnpm db:migrate
pnpm db:seed
```

### 2. Environment (repo root `.env`)

| Variable | Required for |
|----------|----------------|
| `DATABASE_URL` | Postgres |
| `DEV_CONSOLE_PASSWORD_ORG_A` | Dev admin login |
| `PLATFORM_BOOTSTRAP_SECRET` | Provision new org (HTTP / scripts) |
| `NEXT_PUBLIC_PLATFORM_URL` | Platform Ops UI (default `http://localhost:3003`) |
| `SALANOR_ID_URL` | ID service (default `http://127.0.0.1:8091`) |
| `AEGIS_API_URL` | API (default `http://127.0.0.1:8080`) |

### 3. Start apps (loads `.env`)

```bash
pnpm dev
```

| URL | Service |
|-----|---------|
| http://localhost:3000/login | Customer console |
| http://localhost:3003/login | **Platform Ops** (Salanor staff — `platform_staff` on account) |
| http://localhost:8080/health | Aegis API |
| http://127.0.0.1:8091/health | Salanor ID |

**Important:** If **Provision org** returns Forbidden or the console proxy says provisioning disabled, **restart `pnpm dev`** after editing `.env`. Running processes do not reload `PLATFORM_BOOTSTRAP_SECRET` automatically.

### 4. Quick automated smoke test

```bash
node tools/scripts/e2e-onboarding.mjs
```

Expect `=== ALL PASSED ===`. If provision HTTP is 403, the script still tests invite/RBAC using `dev@salanor.local` and prints a warning.

---

## Roles in the journey

| Role | Who | Can do |
|------|-----|--------|
| **Salanor ops** | You | Provision org via **Platform Ops** (`:3003`) or bootstrap API |
| **Org admin** | Customer lead | Invite members, API keys, policies, exports |
| **Engineer** | Developer | Traces, policies (read/write per role), ingest with keys |
| **Viewer** | Read-only | Traces, logs (no admin actions) |

---

## Path A — New company (full journey)

### Step 1 — Salanor ops: create organization + first admin

**UI**

1. Open **http://localhost:3003/login** (Platform Ops — not the customer console).
2. Sign in as staff (e.g. `dev@salanor.local` with `DEV_CONSOLE_PASSWORD_ORG_A`; seed sets `platform_staff`).
3. Go to **Provision org** (`/provision`).
4. Fill:
   - **Organization name:** e.g. `Acme Pilot`
   - **Slug:** e.g. `acme-pilot` (lowercase, unique)
   - **Admin email:** e.g. `lead@acme.com`
   - **Admin password:** (recommended — so they can sign in immediately)
5. Click **Create organization**. The **slug** auto-fills from the name (editable).

**Value:** Creates org in Postgres, admin account + `admin` membership, audit log entry.

**Email:** Provision does **not** email the admin — only **Members → Invite** sends email (if `RESEND_API_KEY` is set). **Save the admin password** you set in the form, or share it out-of-band.

**Forgot admin password:** There is no “forgot password” email yet. Options: (1) admin changes it in **Settings → Security** if they still know the old password; (2) Salanor ops sets a new password via DB/platform admin (coming); (3) invite flow does not apply to the first admin.

**If UI fails:** Use API (secret from `.env`):

```bash
curl -X POST http://127.0.0.1:8091/v1/id/platform/organizations \
  -H "Content-Type: application/json" \
  -H "X-Platform-Secret: YOUR_PLATFORM_BOOTSTRAP_SECRET" \
  -d "{\"name\":\"Acme Pilot\",\"slug\":\"acme-pilot\",\"admin_email\":\"lead@acme.com\",\"admin_password\":\"ChangeMe1!\"}"
```

Tell the customer: sign in at http://localhost:3000/login with that email/password.

---

### Step 2 — Org admin: first sign-in

1. Open http://localhost:3000/login
2. Email + password from Step 1.
3. You should land on **Dashboard** (`/aegis`).

**Value:** Salanor ID session; org switcher shows their organization.

**Check:** **Settings → Organization** — name, slug, org ID.

---

### Step 3 — Org admin: invite teammates

1. **Members** (`/aegis/members`) → **Invite member**
2. Email: e.g. `dev@acme.com`, role **engineer** (or viewer).
3. Copy invite link from:
   - Success banner in UI, and/or
   - Terminal running **Salanor ID** (`pnpm dev:id` log line), and/or
   - Resend email if `RESEND_API_KEY` is set.

**Value:** Invitation row + audit log `invitation.created`; secure token link.

---

### Step 4 — Invitee: create account and join

1. Open invite link in **incognito** (or another browser): `/invite?token=…`
2. Page shows org name + role.
3. **Create your account** — set password (min 8 chars).
4. After submit → redirected to **Dashboard**.

**Value:** New `account` + `membership`; no prior Salanor login required.

**Alternate:** If they already have a Salanor account for that email → **Sign in to accept** instead.

---

### Step 5 — Org admin: API key for ingest

1. **API keys** (`/aegis/keys`) → **Create API key**
2. Name e.g. `production-ingest`
3. **Copy the secret once** (shown only at creation).

**Value:** Agents/SDKs send signed events to your ledger scoped to this org.

**RBAC:** Only **admin** can create keys. Engineer gets **403** (verified in E2E).

---

### Step 6 — Engineer: send events (provenance value)

From repo root (replace secret):

```bash
$env:AEGIS_INGEST_DEV_KEY="<paste-secret-from-step-5>"
pnpm demo:ingest
```

Or use SDK/proxy per [DEV.md](./DEV.md).

**Value:** Signed APS-1 events → **Traces** appear in console for **their org only**.

---

### Step 7 — Everyone: operational console

| Page | What to do | Value |
|------|------------|--------|
| **Dashboard** | Open after ingest | Counts: traces, pending approvals |
| **Traces** | Open list → trace detail → event | Litigation-ready chain, policy decisions |
| **Approvals** | If demo obligation exists: approve/reject | Human-in-the-loop governance |
| **Policies** | Create draft → activate | Tool rules (e.g. deny `stripe.paymentIntents.create`) |
| **Logs** | After invites/keys | Org audit trail |
| **Exports** | Request compliance bundle | SOC2 / EU AI Act style export (worker + dir in `.env`) |

---

### Step 8 — Settings (account, not product data)

| Tab | Who | Value |
|-----|-----|--------|
| **Profile** | Any user | Display name, memberships list |
| **Organization** | Any | Org metadata |
| **Security** | Any | Change password |
| **Provision org** | Salanor ops only | Create more customer orgs |

---

## Path B — Quick test with dev seed (no provision)

1. `pnpm db:seed`
2. Login: `dev@salanor.local` / password from `DEV_CONSOLE_PASSWORD_ORG_A`
3. Follow Steps 3–7 above (invite a test email you control).

Org **Dev Organization** may already have demo traces after `pnpm demo:ingest` with dev key from seed.

---

## What is not built yet

See **[docs-internal/REMAINING_WORK.md](../docs-internal/REMAINING_WORK.md)** (P2+ product, enterprise, infra). Platform Ops, plan limits, and billing code are shipped — Stripe needs env keys to go live.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Provision **Forbidden** | Restart `pnpm dev`; confirm `PLATFORM_BOOTSTRAP_SECRET` in `.env` |
| Console **503** on provision | Next.js needs same secret in `.env`; restart console |
| **401** on `/api/console/*` | Sign in again; ensure `aegis-api` + `id` running |
| Invite link invalid | Token expired (7 days) or revoked — send new invite |
| No traces after ingest | Wrong API key org; check key created under correct org |
| Engineer cannot create keys | Expected — use admin account |

---

## Related

- [REMAINING_WORK.md](../docs-internal/REMAINING_WORK.md) — open work  
- [IMPLEMENTATION_PLAN.md](../docs-internal/IMPLEMENTATION_PLAN.md) — what we shipped since the plan  
- [PLATFORM_OPS.md](../docs-internal/PLATFORM_OPS.md) — Salanor staff app vs customer console  
- [DEV.md](./DEV.md)
