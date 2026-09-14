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

## Platform Ops features (routes)

| Path | Function |
|------|----------|
| `/` | Overview |
| `/provision` | Create org + admin + default agent + plan (admin+) |
| `/organizations` | List/edit orgs, plan assignment, **View in console** (impersonate) |
| `/accounts` | List accounts, platform role (superadmin), suspend, password reset |
| `/plans` | Plan catalog limits + Stripe price IDs |
| `/leads` | Marketing contact form (`CONTACT_DATA_DIR/messages.jsonl`) |
| `/audit-logs` | Cross-tenant console audit trail (paginated) |
| `/commands` | Command reference — all pnpm scripts, roles, scenario cheat sheet |
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

---

## Related docs

- [E2E_PARTNER_ONBOARDING.md](../docs/E2E_PARTNER_ONBOARDING.md) — provision flow (now via Platform Ops or API)
- [REMAINING_WORK.md](./REMAINING_WORK.md) — open work (P2+, enterprise)
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) — stages + shipped summary
