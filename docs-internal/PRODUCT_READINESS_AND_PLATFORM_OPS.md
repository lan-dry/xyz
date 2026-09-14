# Product readiness, platform ops, billing & admin

**Status:** Living document  
**Last updated:** 2026-05-21  
**Audience:** Founders, engineering, design partners  

This file captures readiness for early users, what is built vs planned, how billing/plans should work, and a **recommended build order** (test the console first, then implement admin + plans behind flags so you can “turn on” paid flows without a rewrite).

Related docs:

- **[BACKLOG.md](./BACKLOG.md)** — single ordered list of work not yet done  
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) — stages 0–12, blueprint phases  
- [docs/DEV.md](../docs/DEV.md) — local dev, E2E demo script  
- [adr/0006-identity-membership-invites.md](./adr/0006-identity-membership-invites.md) — accounts, org membership, invites  
- [adr/0002-organization-vs-tenant.md](./adr/0002-organization-vs-tenant.md) — `organization` + `organization_id`  

---

## 1. Recommendation (what to do next)

| Order | Work | Why |
|-------|------|-----|
| **1** | **Test everything already in the console** (checklist §8) | Avoid building admin/billing on a broken P0/P1 path. |
| **2** | **Platform ops skeleton + feature flags** (§7) | Orgs, members, plan assignment, limits enforcement — works manually before Stripe. |
| **3** | **Stripe / self-serve checkout** (§6.4) | Enable when a customer is ready to pay; webhooks flip `plan` + subscription state. |

**Do not** wait until partners are at the door to design plans: implement **catalog + org.plan + enforcement** now, with **payments disabled** via env until go-live.

**Philosophy:** *Build complete, ship gated* — admin can set `team` / `enterprise` without payment; ingest and console respect limits; checkout stays off until `BILLING_CHECKOUT_ENABLED=1`.

---

## 2. Is the app ready for early users?

### Ready for design partners (invited / provisioned)

| Capability | Status |
|------------|--------|
| Salanor ID login, sessions, org switch | ✅ |
| Invite flow (`/invite`), signup-accept | ✅ |
| Provision org (Platform Ops app + `PLATFORM_BOOTSTRAP_SECRET`) | ✅ — see [PLATFORM_OPS.md](./PLATFORM_OPS.md) |
| Members, API keys, Policies (standalone console pages) | ✅ |
| Traces, events, approvals, policies, exports | ✅ |
| Audit logs (console actions) | ✅ |
| Ingest API keys (multiple per org) | ✅ |
| Optional invite email (Resend) | ✅ optional |

### Not ready for self-serve paid SaaS (yet)

See **[BACKLOG.md](./BACKLOG.md)** §2 (P1.5) and §3 (P2) for the full ordered list (billing, plan enforcement, platform admin, Stripe, SSO, etc.).

**Blueprint alignment:** P1 = design partners on real events; P2 = **5 paying** customers. Payments are a P2 business gate, not a P0 code gate — but **plan logic** should exist before P2.

---

## 3. Customer onboarding (no public registration)

| Actor | Action |
|-------|--------|
| **Salanor ops** | Create org + first admin: **Settings → Provision org** or `POST /v1/id/platform/organizations` with `X-Platform-Secret` |
| **Org admin** | **Members → Invite** → invitee opens `/invite?token=…` |
| **Invitee** | Create password (new account) or sign in (existing) → joins org with invited role |
| **Dev** | `pnpm db:seed` → `dev@salanor.local` + `DEV_CONSOLE_PASSWORD_ORG_A` |

There is **no** marketing-site signup into the console.

---

## 4. Billing & plans — how it usually works

### 4.1 Principles

- **Plan is per organization**, not per user or per API key.
- **API keys** are credentials inside an org; the plan caps **how many keys** and/or **monthly ingest volume**.
- **Enterprise** limits are often **custom overrides** on the org row, not a separate codebase fork.

### 4.2 Who sets the plan?

| Mode | Who |
|------|-----|
| **Ops / sales (now)** | Salanor admin sets `organization.plan` in platform admin or provision UI (unpaid OK for pilots). |
| **Self-serve (later)** | Customer picks plan at checkout; Stripe webhooks update org + subscription. |
| **Enterprise** | Contract + manual `enterprise` + custom limits JSON |

### 4.3 Upgrade mid-cycle

Standard SaaS (e.g. Stripe proration):

- **Upgrade:** Often **immediate** new limits; charge **prorated** difference for remaining days in the billing period.
- **Downgrade:** Often **end of period** or credit on next invoice — not “lose the whole month.”
- **Annual:** Prorated credit/charge on plan change; details in Stripe config.

Partners should **not** lose prepaid time on upgrade; unused **quota** (e.g. unused event allotment) is not refunded as cash unless negotiated.

### 4.4 Salanor plan catalog (proposed v1)

Matches DB check: `organization.plan IN ('free', 'team', 'enterprise')`.

| Plan | Typical buyer | Indicative price | Entitlements (configure in catalog) |
|------|---------------|------------------|-------------------------------------|
| **free** | Design partner, dev sandbox | $0 | Low events/month, short retention, capped members & API keys, core console |
| **team** | Production team | e.g. $299–799/mo | Higher events/month, longer retention, more keys, exports, approvals, email support |
| **enterprise** | Regulated / volume | Custom | Custom limits, BYOC/topology, SSO (later), DPA, SIEM, priority support |

**Metering dimensions (implement incrementally):**

1. Ingested **events / month** (primary)  
2. **Members** (seats with write access)  
3. **API keys** (count active)  
4. **Retention days** (data lifecycle)  
5. Add-ons: export packs, witness frequency (later)  

### 4.5 Target data model (to implement)

Already today:

```sql
organization.plan TEXT NOT NULL DEFAULT 'free'
  CHECK (plan IN ('free', 'team', 'enterprise'))
```

Recommended additions (migration when implementing §7):

| Table / column | Purpose |
|----------------|---------|
| `plan_catalog` | `slug`, display name, limits JSON, `active`, `self_serve` bool |
| `organization.plan` | FK or slug match to catalog |
| `organization.plan_overrides` | JSON optional limits for enterprise |
| `organization.subscription_status` | `none` \| `active` \| `past_due` \| `canceled` |
| `organization.stripe_customer_id` | nullable until billing on |
| `usage_monthly` | org_id, period, event_count (rollup for enforcement) |

**Enforcement points:**

- Ingest API: reject or 402/429 when over monthly events or inactive org  
- Console: hide/disable actions (e.g. create key, export) by plan  
- Ops: can always override for support  

### 4.6 Payments (when to turn on)

| Env / flag | Meaning |
|------------|---------|
| `BILLING_CHECKOUT_ENABLED=0` | No checkout UI; ops sets plan manually (default for pilots) |
| `BILLING_CHECKOUT_ENABLED=1` | Show plan picker + Stripe Checkout for `self_serve` catalog plans |
| Stripe webhooks | Set `plan`, `subscription_status`, `current_period_end` |

Blueprint: dedicated `services/billing` in Stage 11; until then, webhooks can live in `services/id` or `aegis-api` behind a thin module.

---

## 5. Console IA (current)

| Sidebar | Route | Notes |
|---------|-------|--------|
| Dashboard | `/aegis` | Operational counts |
| Traces / Approvals | `/aegis/traces`, `/aegis/approvals` | Product data |
| Members | `/aegis/members` | Standalone page (not under Settings tabs) |
| API keys | `/aegis/keys` | Standalone |
| Policies | `/aegis/policies` | Standalone |
| Logs | `/aegis/logs` | Org audit trail |
| Exports | `/aegis/exports` | Compliance bundles |
| Settings | `/aegis/settings/*` | Profile, Organization, Security, Provision org (ops) |

Redirects: `/aegis/settings/members` → `/aegis/members` (etc.) in `apps/web-console/next.config.ts`.

**Profile in Settings:** Normal for B2B; personal account vs org admin tools split as above.

---

## 6. Platform Ops app (Salanor employees)

**Shipped:** separate Next.js app `apps/web-platform` at **`ops.salanor.com`** (local `:3003`). Customer Aegis Console no longer embeds cross-tenant admin. Full access model: [PLATFORM_OPS.md](./PLATFORM_OPS.md).

### 6.1 Must-have for “ready when customers pay”

| Feature | Description |
|---------|-------------|
| **All organizations** | List/search orgs, plan, status, created_at |
| **Organization detail** | Change `plan`, `active`, custom limits; view usage vs quota |
| **All accounts (global users)** | List accounts (email, created, memberships); not the same as single-org Members |
| **Block / suspend** | Deactivate account or membership; revoke sessions |
| **Plan catalog admin** | CRUD `plan_catalog` limits (events/month, max_keys, max_members, retention_days) |
| **Assign plan without payment** | Ops sets `team` / `enterprise` for pilots — **required before partners pay** |
| **Provision org** | `/provision` in Platform Ops |

### 6.2 Customer-facing plan selection (gated)

| Feature | Description |
|---------|-------------|
| **Organization → Plan** | Show current plan, usage, upgrade CTA |
| **Choose plan** | When `BILLING_CHECKOUT_ENABLED=1`, Stripe Checkout for self-serve SKUs |
| **Invoices** | Stripe Customer Portal link (later) |

### 6.3 Nice-to-have (after core)

- Marketing contact inbox — ✅ in Platform Ops `/leads`  
- Impersonate org (support, audit-logged)  
- Global audit log across orgs  
- Usage graphs on dashboard  

---

## 7. Implementation phases (engineering)

### Phase A — Console QA (now)

Complete §8 checklist; file issues; no new features until P0 path is green.

### Phase B — Plans + limits (no Stripe)

1. Migration: `plan_catalog`, usage rollup table/cron, optional `organization` subscription columns  
2. Seed catalog: `free`, `team`, `enterprise` limits  
3. `provisionOrganization(..., plan?)` + provision UI plan dropdown  
4. Middleware: ingest + key creation check limits  
5. Console: show plan + usage on Organization settings; 402/429 messages  

**Exit test:** Ops sets org to `team` without payment; ingest blocks when over monthly cap.

### Phase C — Platform admin (ops)

1. Routes: `/platform` or expand ops settings — org list, account list, block user, change plan  
2. Auth: only Salanor staff (`PLATFORM_BOOTSTRAP_SECRET` / future `platform_role`)  
3. Plan catalog editor (simple forms)  

**Exit test:** Find user by email, suspend, change org plan from admin.

### Phase D — Stripe (activate when ready)

1. Products/prices match `plan_catalog`  
2. Checkout session + webhooks → update org  
3. `BILLING_CHECKOUT_ENABLED=1` in production  
4. Customer portal for invoices  

**Exit test:** Test card upgrades org to `team`; proration configured in Stripe Dashboard.

---

## 8. Console testing checklist (Phase A)

**Walkthrough (recommended):** [docs/PHASE_A_CONSOLE_CHECKLIST.md](../docs/PHASE_A_CONSOLE_CHECKLIST.md) — step-by-step on customer console `:3000` only.  
**First design partner:** [docs/FIRST_DESIGN_PARTNER.md](../docs/FIRST_DESIGN_PARTNER.md).  
**Plan limit smoke (Phase B):** `pnpm pilot:plan-limit`.

Run with `pnpm db:migrate`, `pnpm db:seed`, ID + API + console dev servers per [DEV.md](../docs/DEV.md).

### Auth & identity

- [ ] Login `dev@salanor.local` (org A)  
- [ ] Forgot password → reset link (ID terminal or Resend)  
- [ ] Logout / session cookie  
- [ ] Org switcher (org A ↔ org B if seeded)  
- [ ] Invite: create invite → open link in incognito → signup or sign-in → lands in console  
- [ ] Wrong-account invite shows clear error  

### Ops

- [ ] Provision org (Platform Ops `:3003` or API) creates org + admin  
- [ ] Invite email logs in ID terminal; Resend if configured  

### Product

- [ ] Dashboard loads trace/approval counts  
- [ ] Traces list + trace detail + event detail  
- [ ] Approvals approve/reject  
- [ ] Policies: create draft (tool / max per tx / daily total), activate  
- [ ] Policy deny on ingest when amount exceeds daily cap (repeated txs)  
- [ ] API keys: create, rename, revoke, bulk revoke  
- [ ] Exports: request bundle (if worker running)  
- [ ] Logs: audit entries after invite/key actions  

### Members (standalone `/aegis/members`)

- [ ] Admin: invite, revoke, list members  
- [ ] Admin: change member role after invite (dropdown)  
- [ ] Non-admin: “Admin access required”  

### Settings

- [ ] Profile, Organization, Security tabs only (no Members/keys/policies tabs)  
- [ ] Password change  

### Ingest (API / SDK)

- [ ] Ingest with dev key → trace appears in console  
- [ ] Denied tool (`stripe.paymentIntents.create`) if policy seeded  

---

## 9. Marketing contact leads

| Item | Location |
|------|----------|
| API | `POST /api/contact` on marketing app |
| Storage | `apps/web-marketing/.data/contact/messages.jsonl` or `CONTACT_DATA_DIR` |
| Platform Ops inbox | `/leads` on Platform Ops app |

---

## 10. Feature flags & env (reference)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_PLATFORM_URL` / `PLATFORM_ORIGIN` | Platform Ops app URL + CORS |
| `PLATFORM_BOOTSTRAP_SECRET` | Automation / script provision API |
| `BILLING_CHECKOUT_ENABLED` | **(proposed)** Hide/show checkout & plan picker |
| `RESEND_API_KEY` | Optional invite email |
| `DEV_CONSOLE_PASSWORD_ORG_A/B` | Dev login passwords |

---

## 11. Deferred work (backlog)

All items not yet implemented — ordered by priority — live in **[BACKLOG.md](./BACKLOG.md)**. That file replaces the former §11 deferral tables in this document.

---

## 12. Document history

| Date | Change |
|------|--------|
| 2026-05-22 | Deferred work moved to [BACKLOG.md](./BACKLOG.md) |
| 2026-05-21 | §11.2: P2+ deferrals (ML, OPA editor, ops reset, auto-provenance, etc.) |
| 2026-05-21 | Initial version: readiness, billing model, admin roadmap, test checklist, build order |
