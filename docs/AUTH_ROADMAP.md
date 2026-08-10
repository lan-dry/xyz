# Authentication roadmap — `@salanor/auth`

**Version:** 1.0 · **May 2026**  
**Status:** Active plan (not optional notes)  
**Owner:** Salanor engineering

This document is the **single source of truth** for identity and access work. It replaces any earlier Clerk-based assumptions. **We will complete every stage below**; stages are **sequenced**, not optional ideas.

**Decision (locked):** [Auth.js v5](https://authjs.dev/) in **`packages/auth`** (`@salanor/auth`). Sessions and users live in **our Postgres**. We do **not** use Clerk.

---

## Architecture (all stages)

```
┌─────────────────────────────────────────────────────────────┐
│  apps/web, apps/console-aegis (future), …                  │
│  Thin: middleware, routes, UI                               │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  @salanor/auth (packages/auth)                              │
│  Providers · callbacks · allowlist · 2FA hooks · SAML bridge  │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  Postgres (Prisma)                                          │
│  User, Account, Session, VerificationToken                   │
│  sal_internal_users · organizations · memberships · audit   │
└─────────────────────────────────────────────────────────────┘
```

| Concern | Owner |
|---------|--------|
| **Authentication** (who signed in) | `@salanor/auth` + Auth.js |
| **Authorization** (what they can do in which org) | App DB: `organizations`, `organization_memberships`, roles |
| **Audit** (what happened, when) | `console_audit_log` + Auth.js events |
| **Enterprise SAML** (Okta/Azure AD) | Stage A5 — WorkOS (or similar) **into** `@salanor/auth`, users still in our `User` table |

---

## Stages (we will implement all of these)

| Stage | ID | Scope | Target phase | Status |
|-------|-----|--------|--------------|--------|
| **A1 — Foundation** | `AUTH-A1` | Email magic link, sessions (Prisma), admin allowlist (`ADMIN_EMAILS` + `sal_internal_users`), `/admin` gate | **P1** | **Shipped** · 2026-05-16 |
| **A2 — Social OAuth** | `AUTH-A2` | Google + GitHub sign-in (staff + future console users) | **P1 complete** or early **P2** | **Shipped** · 2026-05-16 |
| **A3 — 2FA + sign-in audit** | `AUTH-A3` | TOTP (authenticator app); optional WebAuthn later; every sign-in/sign-out/fail → `console_audit_log` | **Before Aegis console GA** (~**P4**) | **Near-complete** · 2026-05-16 — TOTP enrollment/challenge shipped, backup codes still TODO |
| **A4 — Tenants & RBAC** | `AUTH-A4` | Organizations, memberships, roles (`owner`, `admin`, `developer`, `compliance`, `viewer`); enforce `ACCESS_CONTROL_MATRIX.md` | **P4** (Aegis console) | **Engineering complete** · 2026-05-16 |
| **A5 — Enterprise SSO** | `AUTH-A5` | SAML via **WorkOS** (or equivalent) plugged into `@salanor/auth`; map IdP user → our `User` | **P6** or first enterprise deal (**whichever comes first**) | Planned — **not an oversight** |

**Explicit commitment:** Stages **A2–A5 are scheduled work**, not “maybe later.” A5 is tied to **enterprise sales**; if a bank requires SAML before P6, **A5 moves up** (document the date in this file when that happens).

---

## Stage details

### A1 — Foundation (current)

**Delivered in repo (verify locally):**

- `packages/auth` — `createSalanorAuth`, admin allowlist helpers
- Magic link email (Nodemailer + Postmark SMTP)
- Prisma: `User`, `Account`, `Session`, `VerificationToken`, `SalInternalUser`
- `/sign-in`, `/admin`, middleware

**Exit criteria:** Founder can sign in, view contact messages, sign out. `pnpm build` green.

**Env:** `AUTH_SECRET`, `AUTH_URL`, `ADMIN_EMAILS`, `EMAIL_SERVER`, `EMAIL_FROM` — see `.env.example`.

---

### A2 — Google + GitHub OAuth

**Work (all in `@salanor/auth`, not per-app forks):**

- Register OAuth apps (Google Cloud Console, GitHub Developer Settings)
- Add providers to Auth.js config; link to existing `User` / `Account` rows
- Sign-in UI: “Continue with Google / GitHub” on `/sign-in` (and later console)
- Restrict social login to allowed domains or allowlist if needed for admin

**Exit criteria:** OAuth users persist in `User`; session matches magic-link users; audit event logged (once A3 started, backfill hook).

**FR linkage:** `FR-AUTH-OAUTH` in `FUNCTIONAL_REQUIREMENTS_SPEC.md`.

**Shipped:** Providers in `packages/auth/src/providers.ts`; `/sign-in` shows OAuth buttons when env vars are set. Account linking uses Auth.js default (same email → one `User`).

---

### A3 — 2FA (TOTP) + authentication audit events

**Work:**

- `user_totp_secrets` (or equivalent) table — document in migration when built
- After primary auth, challenge TOTP before full session (internal admin first, then console)
- Recovery codes (hashed storage)
- On `signIn`, `signOut`, `signInFailure`: append `console_audit_log` (`action`: `auth.sign_in`, etc.)

**Exit criteria:** Admin can enable 2FA; login without TOTP fails; audit rows visible for auth events.

**Extension points:** `packages/auth` — see package README.

**Current delivery:** Console layout logs `auth.sign_in` to `console_audit_log` (cookie-debounced). `/console/settings` now supports TOTP enrollment (QR + manual key), verification, disable, encrypted-at-rest secret storage, and `auth.totp_enabled` / `auth.totp_disabled` audit events. Middleware enforces TOTP challenge before `/admin`, `/console`, and `/api/console` when enabled.

**Remaining TODO (A3):** backup/recovery codes and explicit `auth.sign_out` / `auth.sign_in_failure` event hooks.

---

### A4 — Organizations + RBAC (product authorization)

**Work:**

- Implement `DATA_MODEL_AEGIS_CONSOLE.md` models: `organizations`, `organization_memberships`, API keys
- **Not** a third-party org product — we own tenancy in Prisma
- Session carries `userId`; app resolves active `organizationId` + role
- Enforce matrix in `ACCESS_CONTROL_MATRIX.md` at API + UI layers

**Exit criteria:** Two test orgs isolated; role `viewer` cannot create API keys; cross-tenant query tests pass.

**FR linkage:** `FR-CON-*` in functional spec.

**Engineering-complete (P4):**

- Prisma models + `/console` in `apps/web` (not a separate deploy yet)
- `@salanor/auth` sign-in allows **admin allowlist OR org membership** (`packages/auth/src/console.ts`)
- **`ADMIN_EMAILS` gates `/admin` only** — console authorization is `organization_memberships.role`
- API: `/api/console/*` with `requireRole` (viewer / developer / admin / compliance)
- Env: `AEGIS_CONSOLE_AUTO_PROVISION=1` for local dev org bootstrap
- Ingest auth accepts hashed org API keys (`Bearer` or `X-Aegis-Api-Key`) with `AEGIS_INGEST_DEV_KEY` as optional local fallback
- RBAC contract tests verify critical route gates (viewer / developer / compliance / admin)

---

### A5 — Enterprise SSO (SAML)

**Work:**

- Evaluate **WorkOS** (recommended pairing with Auth.js) vs build-native SAML
- Add SAML connection per enterprise customer; JIT provision `User` + `organization_memberships`
- Document in trust center / security page for buyers

**Exit criteria:** Pilot customer logs in via Okta; user record exists in our DB; SSO login audited.

**Trigger to pull forward:** First paying enterprise requires SAML in writing.

---

## Can we implement everything now?

**Technically possible; strategically wrong to do it all at once.**

| If you build A1–A5 immediately | Consequence |
|--------------------------------|-------------|
| ~4–8+ weeks auth-only | **Aegis Phase 0** (SDK, `record()`, replay) slips — product story stalls |
| SAML before customers | Paid WorkOS + integration cost with no revenue |

**Recommended execution order:**

1. **Finish A1** (prove admin + contact + build).
2. **Aegis Phase 0** (product wedge) — parallel only if A1 is done.
3. **A2** (OAuth) — quick win in `@salanor/auth`.
4. **P4 prep:** **A3 + A4** with Aegis console.
5. **A5** when sales or **P6** demands it.

This roadmap **does not drop** A2–A5; it **sequences** them so authentication is complete **by the time Aegis console ships**, with SAML ready for enterprise.

---

## What we explicitly rejected

| Option | Why not default |
|--------|------------------|
| **Clerk** | Vendor lock-in on core identity; MAU cost; audit/RBAC still ours for Aegis |
| **Supabase Auth** | Couples auth to another platform; we use Neon + Prisma |
| **Auth0-only** | Heavier/costlier early; may revisit for niche enterprise |

---

## Documentation map

| Document | Role |
|----------|------|
| **`AUTH_ROADMAP.md`** (this file) | Stages A1–A5, dates, triggers |
| **`packages/auth/README.md`** | Developer usage + 2FA hooks |
| **`INFRASTRUCTURE_DECISIONS.md`** | Auth.js decision |
| **`ACCESS_CONTROL_MATRIX.md`** | Roles (authorization) |
| **`DATA_MODEL_AEGIS_CONSOLE.md`** | Tenant tables |
| **`IMPLEMENTATION_PLAN.md`** | Product phases P0–P6 |

When a stage ships, update **Status** column above and add a line to **`IMPLEMENTATION_PLAN.md`** changelog section.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-16 | v1.0 — Auth.js + `@salanor/auth`; Clerk removed; A1–A5 committed |
| 2026-05-16 | **A2 shipped** — Google + GitHub OAuth in `@salanor/auth`; sign-in UI + `.env.example` |
| 2026-05-16 | **A3 partial** — console sign-in audit + settings security stub; TOTP deferred |
| 2026-05-16 | **A3 near-complete** — TOTP setup/verify/disable + sign-in challenge + encrypted secret + console audit events |
