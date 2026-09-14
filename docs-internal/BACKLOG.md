# Salanor Aegis — product & engineering backlog

**Status:** Living document (single source of truth for work not yet done)  
**Last updated:** 2026-05-21  
**Audience:** Engineering, founders, design partners  

Use this file when asking *“what still needs to be built?”*  
For **how to test what already exists**, see runbooks (not backlog):

- [docs/E2E_PARTNER_ONBOARDING.md](../docs/E2E_PARTNER_ONBOARDING.md) — partner journey walkthrough  
- [docs/PHASE_A_CONSOLE_CHECKLIST.md](../docs/PHASE_A_CONSOLE_CHECKLIST.md) — Phase A manual QA (`:3000`)  
- [docs/FIRST_DESIGN_PARTNER.md](../docs/FIRST_DESIGN_PARTNER.md) — you `:3003`, partner `:3000`  
- [docs/PILOT_RELEASE_CHECKLIST.md](../docs/PILOT_RELEASE_CHECKLIST.md) — pre-release CI + smoke  
- [docs/COMMANDS.md](../docs/COMMANDS.md) — CLI reference  
- [docs-internal/PRODUCT_READINESS_AND_PLATFORM_OPS.md](./PRODUCT_READINESS_AND_PLATFORM_OPS.md) — readiness, billing design, Phase A test checklist  
- [docs-internal/PLATFORM_OPS.md](./PLATFORM_OPS.md) — Salanor employee app vs customer console  

---

## How this doc is organized (read this first)

There are **two** systems — do not mix them up.

| System | What it is | Example |
|--------|------------|---------|
| **Letters A–E** (§1) | **Order to work in** — a short roadmap for pilots → paid SaaS | “Do console QA before Stripe” |
| **P1.5 / P2 / P3** (§2–4) | **Priority buckets** — detailed tickets with IDs `B-xxx` | B-122 Stripe portal, B-205 members pagination |

- **A–E** = *when* (sequence). Not every letter is “build a feature”; **A is mostly manual testing**.
- **P1.5 / P2 / P3** = *what* is left to build, grouped by how urgent they are.

**Runbooks** (how to test) live in `docs/` and `docs-internal/PRODUCT_READINESS_*` — they are **not** duplicated as backlog items.

### Where we are now (2026-05)

```
[A Console QA]  API smoke ✅ — finish UI rows in PHASE_A_CONSOLE_CHECKLIST
     ↓
[B Plans/limits]  ✅ automated (pilot:plan-limit)
     ↓
[C Platform Ops]  ✅ done
     ↓
[D Stripe]  Code ✅ — enable STRIPE_* + BILLING_CHECKOUT_ENABLED=1 to go live
     ↓
[E P2 depth]  later — §3 when a customer needs it
```

| Letter | Status | Your action |
|--------|--------|-------------|
| **A** | API smoke done | `pnpm pilot:phase-a` + walk [PHASE_A_CONSOLE_CHECKLIST.md](../docs/PHASE_A_CONSOLE_CHECKLIST.md) for UI-only rows |
| **B** | Done | `pnpm pilot:plan-limit` |
| **C** | Done | http://localhost:3003 |
| **D** | Code shipped | Set Stripe keys; `pnpm dev:billing`; test checkout + portal |
| **E** | Not started | Pick from §3 when needed |

**Automated:** `pilot:e2e`, `pilot:plan-limit`, `pilot:phase-a`, `billing:usage-backfill`

---

## Table of contents

0. [How this doc is organized](#how-this-doc-is-organized-read-this-first)  
1. [Recommended build order](#1-recommended-build-order)  
2. [P1.5 — before paid / self-serve SaaS](#2-p15--before-paid--self-serve-saas)  
3. [P2 — product & compliance depth](#3-p2--product--compliance-depth)  
4. [P3+ — platform scale & enterprise](#4-p3--platform-scale--enterprise)  
5. [Infrastructure & blueprint deferrals](#5-infrastructure--blueprint-deferrals)  
6. [Developer tooling & CLI gaps](#6-developer-tooling--cli-gaps)  
7. [Recently completed (do not re-plan)](#7-recently-completed-do-not-re-plan)  
8. [Document history](#8-document-history)  

---

## 1. Recommended build order

Work in this sequence so pilots stay unblocked while paid SaaS becomes possible later.

| Order | Theme | Exit criterion |
|-------|--------|----------------|
| **A** | Console QA (Phase A checklist in [PRODUCT_READINESS §8](./PRODUCT_READINESS_AND_PLATFORM_OPS.md#8-console-testing-checklist-phase-a)) | P0/P1 console path green locally + CI `pilot-gate` |
| **B** | Plans + limits **without Stripe** | Ops assigns `team` plan; ingest blocks over monthly cap |
| **C** | Platform Ops app (Salanor staff) | ✅ Separate app `:3003` / `ops.salanor.com` — see [PLATFORM_OPS.md](./PLATFORM_OPS.md) |
| **D** | Stripe + self-serve checkout | Test card upgrades org; webhooks update `organization.plan` |
| **E** | P2 product items (§3 below) | Per-item exit tests in tables |

**Philosophy:** *Build complete, ship gated* — catalog + enforcement before checkout; `BILLING_CHECKOUT_ENABLED=0` until go-live.

---

## 2. P1.5 — before paid / self-serve SaaS

**Shipped 2026-05-22** (migration `008_plan_limits_platform`, plans module, Platform Ops).  
**Shipped 2026-05-21** (migration `010_stripe_billing`, Stripe portal + verified webhooks + usage backfill). See §7.

Remaining to **go live** (config, not code):

| Item | Notes |
|------|-------|
| Stripe Dashboard | Products/prices → `plan_catalog.stripe_price_id` (Platform → Plans) |
| Env | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BILLING_CHECKOUT_ENABLED=1`, run `pnpm dev:billing` |
| Webhook URL | `POST /v1/billing/webhooks/stripe` — `stripe listen --forward-to localhost:8093/v1/billing/webhooks/stripe` |

### P1.5 — by design (not backlog bugs)

| Item | Status |
|------|--------|
| Public marketing signup into console | **Intentional** — contact / provision / invite only |
| Rich metrics dashboard | Dashboard counts only today; full analytics later |

---

## 3. P2 — product & compliance depth

Does not block first design partners; target before **5 paying customers** (blueprint P2).

| ID | Item | Description | Rationale |
|----|------|-------------|-----------|
| B-201 | **ML / AI on events** | Anomaly detection, risk scoring, narrative summaries from event streams | Needs volume + labels |
| B-202 | **Auto-detect rich provenance** | Infer vendor, amount, trigger without SDK payload fields | Heuristics or ML; today use [docs/APS_PAYLOAD.md](../docs/APS_PAYLOAD.md) |
| B-203 | **Full OPA/Rego policy editor** | Visual Rego, marketplace WASM policies, third-party rules | **Only if prospect requires Rego**; tool patterns + JSON `conditions` suffice for pilots |
| B-204 | **Policy obligation UX at scale** | Bulk approvals, SLA dashboards, approval queues | v1.5 has Slack/email + console deep link ✅ partial |
| B-205 | **Members pagination** | When orgs exceed ~50 members | |
| B-206 | **SOC 2 Type II submission automation** | Beyond export ZIP bundles (Type I style reports exist) | Manual auditor handoff OK for pilots |
| B-207 | **Public transparency log at scale** | Witness + public verifier ops for high volume | Verifier + `/verify` page exist ✅ |
| B-208 | **SOC 2 Type I automation** | Deeper than current dynamic control mapping in exports | Partial in compliance worker |
| B-209 | **Nice-to-have: impersonate org** | Support login, audit-logged | |
| ~~B-210~~ | ~~Global audit log~~ | **Done** — Platform Ops `/audit-logs` | |
| B-211 | **Nice-to-have: usage graphs** | Dashboard charts | |

---

## 4. P3+ — platform scale & enterprise

| ID | Item | Blueprint phase | Notes |
|----|------|-----------------|-------|
| B-301 | **Policy marketplace** | P3 | Third-party Rego / WASM policies |
| B-302 | **BYOC / on-prem** | P3 | Customer-controlled deployment |
| B-303 | **SSO / SAML** | Enterprise | |
| B-304 | **Insurance product (Aether) production** | P5 | Scaffold exists; bridge to underwriters later |
| B-305 | **FedRAMP / on-prem air-gap** | P4 | [IMPLEMENTATION_PLAN deferrals](./IMPLEMENTATION_PLAN.md#what-we-explicitly-defer) |

---

## 5. Infrastructure & blueprint deferrals

From [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) — do not block pilots.

| ID | Item | Notes |
|----|------|-------|
| B-401 | **Full EKS / ArgoCD production** | Compose + Vercel previews until P2 |
| B-402 | **SpiceDB / Zanzibar AuthZ** | Schema ready; wire when cross-product RBAC needs it ([ADR-0003](./adr/0003-p0-console-authentication.md)) |
| B-403 | **immudb** | Not in blueprint |
| B-404 | **Threat model P0 (light)** | `docs-internal/security/threat-model-p0.md` — TODO before Stage 3 prod per implementation plan |

---

## 6. Developer tooling & CLI gaps

| ID | Item | Workaround |
|----|------|------------|
| B-501 | **`pnpm demo:approval` root script** | Use `pnpm demo:full-system` or console **Approvals** |
| B-502 | **OPA WASM rebuild docs** | `pnpm --filter aegis-api policy:build-wasm` when Rego changes ([DEV.md](../docs/DEV.md) Stage 6) |

---

## 7. Recently completed (do not re-plan)

Recorded here so older doc sections are not mistaken for open work.

| Item | Shipped |
|------|---------|
| Identity: invites, membership, forgot/reset password | 2026-05 |
| Policies: tool rules + per-tx / daily amount limits | 2026-05 |
| Compliance exports P1.5/P2 (ZIP, control mapping, monthly schedule) | 2026-05 |
| Approvals v1.5: Slack webhook + email → console `?focus=` | 2026-05 |
| Public verify: `/verify`, API `?verify=1`, marketing link | 2026-05 |
| CI `pilot-gate`: `demo:full-system` + `pilot:e2e` | 2026-05 |
| Member role change (admin) | 2026-05 |
| Event provenance panel + demo checklist | 2026-05 |
| Docs: `COMMANDS.md`, `E2E_PARTNER_ONBOARDING.md`, `PILOT_RELEASE_CHECKLIST.md` | 2026-05 |
| P1.5: plan catalog, limits, usage, platform admin, leads inbox, billing stub (B-101–B-111, B-120–B-121, B-123) | 2026-05-22 |
| Platform Ops app separated from customer console (`apps/web-platform`, `platform_staff`) | 2026-05-22 |
| Stripe portal + webhook verify + usage backfill (B-122, B-124, B-125); migration `010_stripe_billing` | 2026-05-21 |

---

## 8. Document history

| Date | Change |
|------|--------|
| 2026-05-21 | B-122/B-124/B-125 shipped; A/B automation (`pilot:phase-a`, `pilot:plan-limit`) |
| 2026-05-23 | Added “How to read” + “Where we are now”; B-210 marked done (ops audit log) |
| 2026-05-22 | P1.5 implemented; §2 trimmed to remaining Stripe portal / webhook hardening |
| 2026-05-22 | Consolidated backlog from PRODUCT_READINESS §11, E2E “not yet”, PILOT out-of-scope, COMMANDS §9, IMPLEMENTATION_PLAN deferrals |
| 2026-05-21 | Prior fragments in PRODUCT_READINESS §11.2 (pre-approvals notify / public verify) |
