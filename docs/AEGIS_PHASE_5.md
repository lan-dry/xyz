# Aegis Phase 5 — Evidence Polish & Tier B Exploration

**Phase ID:** P5  

---

## Goals

| Item | Detail |
|------|-------|
| Tier B | Bounded LLM variance envelopes recorded |
| SLA dashboards | Replay failures, lag, anchor delays |
| Runbooks | Incident + customer comms templates |
| Hardening | Load tests + chaos repeatable monthly |

---

## Acceptance criteria

Demonstrate reconstructed LLM-assisted decision retains witness metadata & variance capsule when deterministic replay impossible.

---

## Dependencies

Stable P4 customer pilot signal (design partner agreements).

---

## Console implementation tracker (current branch)

### Slice 1 — Organization invites (MVP)

- [x] Add `organization_invites` persistence model (email, org, role, token hash, expiry, accepted, inviter)
- [x] Add console invite APIs: create/list/revoke under `/api/console/invites`
- [x] Add sign-in required invite acceptance flow at `/invite/accept`
- [x] Write invite email sender using existing SMTP env (`EMAIL_SERVER` / `EMAIL_FROM`)
- [x] Add `/console/members` page with members list, pending invites, and invite form
- [x] Add tests for invite token validation and RBAC contract coverage

### Slice 2 — Organization creation

- [x] API for signed-in user to create org + owner membership
- [x] UI for org creation flow in console (`/console/orgs/new` + entry points)
- [x] Reconcile with `AEGIS_CONSOLE_AUTO_PROVISION` in local dev copy/flow

### Slice 3+ (deferred)

- [x] Profile/account settings page (`/console/settings`) with identity + memberships + sign-out
- [x] Billing scaffold (Stripe test mode, org-level plans, webhook stub, `/console/billing`)
- [x] AUTH-A3 TOTP / 2FA baseline (setup/verify/disable + sign-in challenge)
- [ ] AUTH-A3 recovery codes + failure/sign-out event hooks

### Slice 2 UX follow-ups

- [x] Auto-slug create-org UX with editable override + validation preview
- [x] Members UI role management and member removal safety guards

---

## P5 engineering status

**Status:** Engineering complete (core console slices shipped)  
**Date:** 2026-05-16

### Shipped in engineering scope

| Area | Status |
|------|--------|
| Slice 1 invites | Complete |
| Slice 2 org creation | Complete |
| Slice 2 UX polish (auto-slug, members role/remove) | Complete |
| Slice 3 profile/settings | Complete (`/console/settings`) |
| Slice 4 AUTH-A3 | Near-complete (TOTP shipped; recovery codes + extra hooks deferred) |
| Slice 5 console polish | Complete (home/events/nav updates) |

### Explicit deferrals

| Deferred item | Why deferred |
|---------------|--------------|
| Billing / Stripe | Out of current P5 engineering scope; requires billing model + payment integration decisions |
| SAML / WorkOS | AUTH-A5 / enterprise trigger scope, not needed for current console MVP |
| Full policy engine | Planned for later roadmap phase (P6+) |
| Recovery codes + extra auth event hooks | Follow-up hardening after AUTH-A3 baseline ship |
