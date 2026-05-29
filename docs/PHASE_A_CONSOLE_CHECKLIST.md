# Phase A — customer console checklist (manual)

Walk through **http://localhost:3000** only. Salanor staff actions (provision org, leads, cross-tenant accounts) belong on **Platform Ops** (`http://localhost:3003`) — see [E2E_PARTNER_ONBOARDING.md](./E2E_PARTNER_ONBOARDING.md) for that split.

Source checklist: [PRODUCT_READINESS §8](../docs-internal/PRODUCT_READINESS_AND_PLATFORM_OPS.md#8-console-testing-checklist-phase-a).

**Time:** ~45–90 minutes if you hit every row. You can stop after P0 paths for a minimal “green” pass.

---

## Before you start

```bash
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

| URL | Role |
|-----|------|
| http://localhost:3000/login | **Customer console** (this doc) |
| http://localhost:3003/login | Platform Ops (provision only — not Phase A) |
| http://127.0.0.1:8080/health | Aegis API |
| http://127.0.0.1:8091/health | Salanor ID |

**Seeded logins** (passwords from `.env`, defaults in `.env.example`):

| Email | Org | Notes |
|-------|-----|--------|
| `dev@salanor.local` | Org A | Admin; `platform_staff` — header link to Ops, not customer admin |
| `dev-b@salanor.local` | Org B | Org switcher test |

**Automated API smoke** (not a substitute for UI):

```bash
pnpm pilot:phase-a
node tools/scripts/e2e-onboarding.mjs
pnpm pilot:plan-limit
```

---

## How to use this doc

1. Open the console in a normal browser window; use **incognito** for invite / second-user flows.
2. Check boxes as you go (`[x]` in your editor, or copy to a scratch note).
3. Log bugs with: page URL, role, expected vs actual, screenshot if UI.
4. **Do not** file backlog items for “provision org in console” — that moved to `:3003`.

---

## 1. Auth & identity

| Done | Step |
|------|------|
| [ ] | **Login** — http://localhost:3000/login → `dev@salanor.local` + `DEV_CONSOLE_PASSWORD_ORG_A` → lands on dashboard |
| [ ] | **Logout** — user menu → sign out → `/login`; back button should not show protected data without re-auth |
| [ ] | **Forgot password** — `/login` → forgot → enter email → complete reset (link in **ID service terminal** if Resend not set) → sign in with new password |
| [ ] | **Org switcher** — switch Org A ↔ Org B → URL/context changes; traces/settings scoped to selected org |
| [ ] | **Invite (happy path)** — as Org A admin: **Members** → invite `you+invite@test.local` as Engineer → copy link → **incognito** → accept (signup or sign-in) → lands in console with correct org |
| [ ] | **Invite (wrong account)** — while logged in as a *different* user, open invite link → clear error (not silent wrong-org access) |

---

## 2. Ops (customer-visible only)

| Done | Step |
|------|------|
| [ ] | **Provision** — *not in customer console.* Confirm you use **:3003** `/provision` when testing onboarding; skip here unless verifying the customer never sees Platform nav |
| [ ] | **Invite delivery** — after invite, check ID logs for email line; if `RESEND_API_KEY` set, check inbox |

---

## 3. Product surfaces

| Done | Step |
|------|------|
| [ ] | **Dashboard** — cards/metrics load without error (trace/approval counts may be zero) |
| [ ] | **Traces** — list loads; open a trace → event list → open one event detail |
| [ ] | **Approvals** — if any pending items exist, approve and reject once; if empty, note “N/A empty” |
| [ ] | **Policies** — create a **draft** (e.g. tool rule or daily cap) → **activate** → appears in list |
| [ ] | **Policy on ingest** — with an active daily-cap policy, ingest repeated events over cap (API or `pnpm demo:ingest` with org key) → denied / policy reflected on event |
| [ ] | **API keys** — Settings or keys page: **create** → copy secret once → **rename** → **revoke** one → **bulk revoke** if UI offers it |
| [ ] | **Exports** — request an export bundle (needs compliance worker if you want a finished file; UI request alone is enough for Phase A) |
| [ ] | **Audit logs** — **Logs** page shows rows after invite/key actions |

---

## 4. Members (`/aegis/members` or Members nav)

| Done | Step |
|------|------|
| [ ] | **Admin** — list members, send invite, revoke pending invite |
| [ ] | **Admin** — change a member’s role (dropdown) after they joined |
| [ ] | **Non-admin** — sign in as invited Engineer → Members shows “Admin access required” (or no admin actions) |

---

## 5. Settings (profile / org / security only)

| Done | Step |
|------|------|
| [ ] | **Tabs** — Profile, Organization, Security only (no duplicate Members / keys / policies tabs in Settings) |
| [ ] | **Password change** — Security → change password → sign out → sign in with new password |

---

## 6. Ingest (API / SDK)

| Done | Step |
|------|------|
| [ ] | **Dev ingest** — from repo root with `.env` seeded: `pnpm demo:ingest` → new trace in console Traces |
| [ ] | **Denied tool** — if seed policy blocks `stripe.paymentIntents.create`, ingest that tool name → event shows deny (or ingest rejected per policy) |

---

## 7. Platform staff UX (sanity, not full Ops QA)

| Done | Step |
|------|------|
| [ ] | As `dev@salanor.local` on **:3000**, header shows link to **Platform Ops** → opens **:3003** |
| [ ] | Customer sidebar has **no** “Platform” / cross-tenant admin items |

---

## Exit criteria (Phase A done)

- All **P0** rows above checked, or explicitly N/A with reason (e.g. no approvals in seed data).
- No open **P0/P1** bugs on login, traces, members, keys, invite, org switcher.
- CI `pilot-gate` green on your branch (if you changed code while fixing bugs).

---

## Related automation

| Script | What it covers |
|--------|----------------|
| `node tools/scripts/e2e-onboarding.mjs` | Provision API, login, invite, RBAC, keys, audit (API) |
| `pnpm pilot:plan-limit` | Monthly event cap → HTTP **402** on ingest (Phase **B**) |
| [FIRST_DESIGN_PARTNER.md](./FIRST_DESIGN_PARTNER.md) | You on :3003, partner on :3000 |

---

## Document history

| Date | Change |
|------|--------|
| 2026-05-21 | Initial Phase A walkthrough for customer console |
