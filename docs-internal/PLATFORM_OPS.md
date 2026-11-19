# Platform Ops — Salanor internal administration

**Audience:** Salanor employees (platform roles), engineering, founders  
**Status:** Implemented (`apps/web-platform`, migration `012_platform_roles`)  
**Customer-facing counterpart:** [Aegis Console](https://app.salanor.com) — org-scoped product UI only  

---

## Why two apps?

Enterprise SaaS vendors separate **customer product** from **internal operations**:

| Surface | Who | Scope |
|---------|-----|--------|
| **Aegis Console** (`apps/web-console`) | Customer org admins, engineers, auditors | Single organization (members, keys, policies, traces) |
| **Platform Ops** (`apps/web-platform`) | Salanor employees with a **platform role** | All tenants — provision, suspend, plans, leads |

Mixing cross-tenant admin into the customer console sidebar confuses design partners and violates the mental model (“this is *our* product”, not Salanor’s back office).

---

## Platform roles (one per account)

Each account has **at most one** platform role (`account.platform_role`). `NULL` means customer-only (no Platform Ops access).

| Role | Capabilities |
|------|----------------|
| **superadmin** | Full Ops access, including assigning platform roles |
| **admin** | Provision orgs, edit plans, suspend accounts, reset passwords |
| **staff** | Read-only across tenants |

Org roles (`admin`, `engineer`, `auditor`, `viewer`) are **separate** — they live on each **membership** and can differ per organization. A user is not given multiple platform roles; they get one platform role on their account plus one org role per org they belong to.

---

## How staff access Platform Ops

### Development

1. Run `pnpm dev` (includes `@salanor/web-platform` on port **3003**).
2. Ensure `dev@salanor.local` has `platform_role = 'superadmin'` (set by `pnpm db:seed` after migration `012`).
3. Open **http://localhost:3003** → sign in with the same Salanor ID credentials as the console.
4. ID service must allow CORS from `PLATFORM_ORIGIN` (default `http://localhost:3003`).

Optional: from the customer console header, staff see **Platform Ops →** (external link) when `platform_role` is set on their account.

### Production (recommended layout)

| App | Host | Purpose |
|-----|------|---------|
| Marketing | `salanor.com` | Public site, contact form |
| Docs | `docs.salanor.com` | Product documentation |
| **Aegis Console** | **`app.salanor.com`** | Customers |
| **Platform Ops** | **`ops.salanor.com`** | Salanor employees only |
| Salanor ID API | `id.salanor.com` (or internal) | Auth + platform API |

This is a **separate Next.js app**, not a route group inside the console — same pattern as Stripe Dashboard vs merchant dashboard, Datadog admin vs org UI.

### Session cookies

- **Local:** Console (`:3000`) and Platform Ops (`:3003`) use **separate** session cookies unless you configure a shared parent domain.
- **Production:** Set `SESSION_COOKIE_DOMAIN=.salanor.com` so one login can work across `app.` and `ops.` (still require a platform role for ops routes).

### Granting access

**After a demo wipe / fresh DB** (tenant data gone; platform org remains from migrations): restore the Ops superadmin with:

```bash
# From repo root; uses BOOTSTRAP_ADMIN_EMAIL + BOOTSTRAP_ADMIN_PASSWORD from .env
pnpm db:seed:bootstrap
```

That creates/updates the account as `platform_role = 'superadmin'`, verifies email, and attaches membership on `salanor-platform`. Local smoke alternative after `pnpm db:seed` is `dev@salanor.local` already as superadmin.

1. **Platform roles (Salanor internal):** Super admin or platform admin → **Accounts** → profile → **Platform role** (admin cannot grant or modify super admin). Logged as `platform.role.changed` in **Audit log**. Or SQL for bootstrap. Cannot demote the **last** super admin.
2. **Org admin (customer):** Console → **Members** → invite with role **admin**, or change an existing member’s role. Cannot demote the **only** admin.
3. **Automation:** `POST /v1/id/platform/*` with `X-Platform-Secret: <PLATFORM_BOOTSTRAP_SECRET>` (no browser session; full API access).

There is **no** `NEXT_PUBLIC_PLATFORM_OPS` flag on the customer console anymore.

---

## Roles matrix

| Role | Where | Capabilities |
|------|--------|----------------|
| **Org viewer / engineer / auditor / admin** | Aegis Console | Org-scoped product features per membership role |
| **Platform staff** | Platform Ops | Read-only: orgs, accounts, audit log, leads |
| **Platform admin** | Platform Ops | Provision, plans, account support; grant staff/admin (not super admin) |
| **Super admin** | Platform Ops | All of the above + assign super admin; role changes audited |
| **Bootstrap secret** | API only | Same platform routes as staff, for automation |

## Platform staff vs customer console

**Industry pattern:** Internal ops and customer product are separate surfaces (Stripe Dashboard vs merchant dashboard, Datadog admin vs org UI). A platform role does **not** automatically grant access inside customer organizations.

| Access | How it works in Salanor | Typical at Stripe / Datadog / Vercel |
|--------|-------------------------|--------------------------------------|
| **Platform Ops** | Requires `platform_role` (staff/admin/superadmin) | Internal admin app, separate login or SSO group |
| **Customer console** | Requires **org membership** + org role | Merchant/product UI scoped to one tenant |
| **Support in a tenant** | Platform admin/superadmin → **View in console** (impersonation, audited banner) | **Impersonation** with audit trail |
| **Dogfooding / QA** | Dev seed gives `dev@salanor.local` superadmin + org memberships | Employees get sandbox org memberships |

**Recommendation:** Use **Platform Ops** for cross-tenant work. Use the **customer console** only with a real org membership (sandbox or pilot). Do not use `platform_role` as a backdoor into customer data.

**Not built yet (enterprise backlog):**

- SSO for `@salanor.com` with group → platform role mapping
- Full platform action audit (role + impersonation logged; other ops actions backlog)
- ~~Customer impersonation for support~~ **Shipped** (admin/superadmin; staff read-only in Ops only)

---

## Demo data (staff Ops)

| Path | Function |
|------|----------|
| `/demo-tenants` | **Populate full demo** / **Reset to fresh demo** / **Delete demo** (slug confirm). Audit in `platform_tenant_wipe_audit` |

Starting from Ops superadmin + `salanor-platform` only:

1. **Populate** — creates `demo-bank` (org, personas, pack, keys, ~60d history)
2. **Reset** — wipe then populate again (same end state)
3. **Delete** — removes that org and its demo-only users; **Ops superadmin + platform org stay**

Customer orgs are refused in Postgres + API (`not_wipeable`). Wipe/reset need `AEGIS_ALLOW_TENANT_WIPE=1` and `MIGRATION_DATABASE_URL`. No special “demo UX” in the customer console.

---

## Auth review (Ops) — verified

| Control | Status |
|---------|--------|
| Platform role gate (`staff` / `admin` / `superadmin`) | **Built** — session via Salanor ID |
| Staff MFA (TOTP) for Ops login | **Gap** — MFA exists on marketing Auth.js, not on ID/Ops password login |
| Session lifetime | **Partial** — ID session cookie **7 days**; Ops does not set a shorter Ops-only TTL |
| Password login rate limit | **Gap** — OAuth rate-limited; `/v1/id/auth/login` password path has no `checkRateLimit` |
| IP allowlist for Ops | **Gap** — not implemented (edge/CDN allowlist recommended for `ops.salanor.com`) |
| robots / noindex | **Built** — `robots.ts` disallows `/`; `X-Robots-Tag: noindex, nofollow` on all routes |
| Destructive action confirm (type slug) | **Built** on Demo tenants |
| Audit of wipe/demo actions | **Built** — `platform_tenant_wipe_audit` (+ platform audit event on create) |

---

## Platform Ops features (routes)

| Path | Function |
|------|----------|
| `/` | Overview |
| `/provision` | Create org + admin + default agent + plan (admin+) |
| `/demo-tenants` | Demo data: populate / reset / delete + audit |
| `/organizations` | List/edit orgs, plan assignment, **View in console** (impersonate) |
| `/accounts` | List accounts, platform role (superadmin), suspend, password reset |
| `/plans` | Plan catalog limits + Stripe price IDs |
| `/content/leads` | Marketing contact form inbox (JSONL via Salanor ID; `/leads` redirects here) |
| `/content/blog` | Git Markdown blog — list, edit, stats, media (`@salanor/marketing-blog`) |
| `/content/research` | Research posts CMS (Prisma `research_posts`) |
| `/content/careers` | Open roles CMS (Prisma `open_roles`) |
| `/audit-logs` | Cross-tenant console audit trail (paginated) |
| `/commands` | Command reference — all pnpm scripts, roles, scenario cheat sheet |
| `/settings/email` | Transactional email (SMTP or Resend) for invites / resets / approvals; includes Send test email |
| `/accounts/:id` | Account profile + memberships |

**UI:** Same design tokens and components as Aegis Console (`console.css` + shared patterns). Fixed sidebar + top bar (theme **M**). List pages use URL query params: `?page=1&limit=25&q=search` (shareable, back-button friendly). Light/dark theme: `salanor.console.theme` in localStorage.

---

## Plans, logs, and stats (industry practice)

| Topic | Salanor approach | Typical at Stripe / Datadog / Vercel |
|-------|------------------|--------------------------------------|
| **Create new plan tier** | **Predefined** in migrations (`plan_catalog` seed). Not created ad-hoc in UI — avoids orphan SKUs and enforcement drift. | Product tiers ship with releases; new SKU = eng change. |
| **Edit plan limits** | **Yes** in Platform Ops (events/mo, keys, members, self-serve, Stripe price ID) with explicit **Save** per row. | Ops or eng updates catalog; sometimes feature flags. |
| **Per-customer limits** | `organization.plan` + optional `plan_overrides` (pilots) | Custom contracts / overrides table. |
| **Platform audit log** | **Yes** — `/audit-logs` (all orgs). Org-scoped log remains in customer console **Logs**. | Internal admin has global + per-tenant views. |
| **Stats** | **Overview** KPIs: org count, account count, aggregate events this month. Rich analytics = later (P2). | Executive dashboard + drill-down; full metrics stack is P2+. |
| **Account profile** | **Yes** — paginated list + `/accounts/:id` (memberships, platform role, suspend, reset password). | Standard support workflow. |

**Not in Platform Ops yet (backlog):** staff action audit, impersonation, billing revenue dashboard, create-plan UI without migration.

API: `GET/POST/PATCH /v1/id/platform/*` on Salanor ID (proxied by Next as `/api/platform/*`).

---

## Environment variables

| Variable | Used by | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_PLATFORM_URL` | Console, Platform Ops | Link to ops app (`http://localhost:3003`) |
| `PLATFORM_ORIGIN` | Salanor ID CORS | Allow credentialed login from ops app |
| `PLATFORM_BOOTSTRAP_SECRET` | ID platform routes | Script/automation auth |
| `CONTACT_DATA_DIR` | Marketing + ID leads | Shared JSONL inbox (repo `.data/contact`) |
| `SESSION_COOKIE_DOMAIN` | ID cookie | Optional shared login across subdomains |

See [.env.example](../.env.example).

---

## What stays in the customer console

- Members, invites, API keys, policies, traces, approvals, exports, org settings
- **Org plan & usage** (read-only for the customer’s own org) — not cross-tenant admin

Console routes `/aegis/platform` and `/aegis/settings/provision` redirect to Platform Ops. Do not rebuild cross-tenant admin inside the customer console.

---

## Related docs

- [E2E_PARTNER_ONBOARDING.md](../docs/E2E_PARTNER_ONBOARDING.md) — provision flow (now via Platform Ops or API)
- [REMAINING_WORK.md](./REMAINING_WORK.md) — open work (P2+, enterprise)
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) — stages + shipped summary
