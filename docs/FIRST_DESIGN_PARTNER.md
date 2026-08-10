# First design partner — local runbook

**You (Salanor):** Platform Ops **http://localhost:3003**  
**Partner (customer):** Aegis Console **http://localhost:3000**

Full step-by-step UI paths: [E2E_PARTNER_ONBOARDING.md](./E2E_PARTNER_ONBOARDING.md).

---

## 1. One-time setup (your machine)

```bash
docker compose up -d
pnpm db:migrate
pnpm db:seed
```

Repo root `.env` must include at least:

- `DATABASE_URL`
- `PLATFORM_BOOTSTRAP_SECRET` (provision API + Ops)
- `DEV_CONSOLE_PASSWORD_ORG_A` (your staff login to **:3003**)
- `NEXT_PUBLIC_PLATFORM_URL=http://localhost:3003` (optional; defaults work locally)

Start everything:

```bash
pnpm dev
```

Automated dry run (API only):

```bash
node tools/scripts/e2e-onboarding.mjs
```

Expect `=== ALL PASSED ===`.

---

## 2. You — create their org (:3003)

1. Open **http://localhost:3003/login**
2. Sign in as staff: `dev@salanor.local` / `DEV_CONSOLE_PASSWORD_ORG_A` (seed sets `platform_staff`)
3. **Provision org** (`/provision`):
   - **Name:** e.g. `Acme Pilot`
   - **Slug:** e.g. `acme-pilot` (unique, lowercase)
   - **Admin email:** partner’s real or test email
   - **Admin password:** strong temp password (they should change it in Settings → Security)
4. **Copy the signing private key** from the success screen if shown (one-time). Store in your password manager until they have their own keys.

**API fallback** (if UI fails):

```bash
curl -X POST http://127.0.0.1:8091/v1/id/platform/organizations \
  -H "Content-Type: application/json" \
  -H "X-Platform-Secret: YOUR_PLATFORM_BOOTSTRAP_SECRET" \
  -d "{\"name\":\"Acme Pilot\",\"slug\":\"acme-pilot\",\"admin_email\":\"lead@acme.com\",\"admin_password\":\"ChangeMe1!\"}"
```

---

## 3. Handoff email (template)

Send the partner only **customer** URLs:

| Item | Value |
|------|--------|
| Console | http://localhost:3000/login (prod: https://app.salanor.com/login) |
| Email | `lead@acme.com` (what you provisioned) |
| Temp password | (from step 2) |
| Docs | Your pilot doc or `docs/` site if hosted |

**Do not** give them Platform Ops (`:3003`) or `PLATFORM_BOOTSTRAP_SECRET`.

Ask them to:

1. Sign in and change password (Settings → Security).
2. Invite their engineers (Members).
3. Create an ingest API key (console) and run a test event (your SDK snippet or `pnpm demo:ingest` instructions adapted to their org).

---

## 4. Partner — first hour (:3000)

They should complete (you can watch on a call):

| Step | Where |
|------|--------|
| Login | `/login` |
| Dashboard + Traces | After first ingest |
| Members → invite engineer | `/aegis/members` |
| API key → ingest test | Settings / keys + their agent |
| Optional: policy draft | Policies |

Your **Phase A** QA checklist (broader): [PHASE_A_CONSOLE_CHECKLIST.md](./PHASE_A_CONSOLE_CHECKLIST.md).

---

## 5. What you verify on your side

| Check | How |
|-------|-----|
| Org exists | Platform Ops → Organizations → `acme-pilot` |
| Usage / plan | Account or org detail in Ops; plan `free` unless you changed it |
| Audit trail | Ops → Audit logs — `organization.provisioned`, invites, keys |
| Limits (Phase B) | `pnpm pilot:plan-limit` or set low cap in Ops → ingest until **402** |

---

## 6. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Provision **403 Forbidden** | Restart `pnpm dev` after adding `PLATFORM_BOOTSTRAP_SECRET` to `.env` |
| Partner cannot login | Confirm email/password; org `active`; try reset password flow |
| No traces after ingest | Wrong org on key; API down; check `AEGIS_API_URL` and signing key / ingest key |
| Staff link missing on :3000 | Seed `platform_staff` on account; use `dev@salanor.local` |

---

## Document history

| Date | Change |
|------|--------|
| 2026-05-21 | First design partner cheat sheet (:3003 vs :3000) |
