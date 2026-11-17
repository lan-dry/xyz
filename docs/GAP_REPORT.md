# Gap report — forensic readiness and bank pilot

**Branch:** `remove-demo-mode`  
**Baseline tag:** `pre-remove-demo-mode`  
**Date:** 2026-11-17  
**Authority:** Status here must match `docs/FINAL_REPORT.md`. Mark Present / Done only when implemented and tested.  
**Deploy:** Nothing from this branch publishes to salanor.com until reviewed.

> **Single path (2026-11-17):** no runtime demo mode. Use `demo:up`, `pilot:provision-demo-tenant`, `pilot:seed-history`, `pilot:wipe-tenant` / `demo:fresh`, and `bank-simulator` against an `is_demo` tenant. See `docs/DEMO.md`.

---

## Phase checkpoints

| Phase | Status | Notes |
|-------|--------|-------|
| 0 Baseline / branch / tag | Done | `pre-forensic-demo` tag; golden evaluate-rules tests |
| 1 Engine / adapter / matrix / field policy | Done | Pack-driven; unit + multi-tenant insurance E2E |
| 2 Approvals / receipts / aegis-verify | Done (Pass 2 screens captured) | Evidence bundle + Demo Bank verify; B1 rule validate; B2 fail-safe default; Rules matrix/v3–v4; runbook-walk screens captured 2026-11-15. One bank-ready item (3.5 case/replay) still has no automated test, see FINAL_REPORT |
| 3 Integration / batch import | Done (Partial delivery) | HTTP batch record-only + dry_run; bank-core stub labelled; webhook retry incomplete |
| 4 Search / admin UI / i18n | Partial | Canned CSV + real reports page (stub label removed); i18n file partial |
| 5 P1–P10 hardening | Partial | Production boot guards, KMS Ed25519 Plan A/B, RFC 3161 client, `DEPLOY_PRODUCTION.md`, `is_demo` + Delegations, bank-simulator login/deploy docs, Approvals Release/callback UI + screens, `demo:full-menu` Present; live KMS Sign, public TSA, and hosted `smoke:production` wait on founder credentials |
| 6 Demo ops | Partial | Pass 2 + production P0/P7 screens; Partial only because 3.10 / 3.14 / 3.15 have no screen proof |
| 7 Website | Partial | Claim honesty + `/banks`; **no live publish** |

---

## Summary (aligned with FINAL_REPORT)

| Area | Overall | Notes |
|------|---------|-------|
| R1 Event intake | Present | `/governed/events` + `/bank/events`; sealed when agent key exists |
| R2 Policy engine | Present (Partial dual-publish UX) | `all_matching` opt-in; content_hash; dual_publish_required on activate |
| R3 Authority matrix | Present | Pack data only (`demo.banking` / `demo.insurance`) |
| R4 Approvals | Present | Role/SoD/required fields + HTTP session approve test; escalate_to_role + time-bound delegation (scenario 10) |
| R5 Evidence | Present | Forensic receipts + console evidence-bundle/PDF; decision_basis; append-only 015 |
| R6 Verifier | Present | `pnpm aegis-verify`; Verify page drop-zone; scenario 12 |
| R7 Field policy | Present | store/mask/hash/evaluate_only/omit + scenario 8 |
| R8 Search / reports | Present | Canned CSV API; real console Reports page with filters (stub label removed) |
| R9 Admin / security | Partial | Access-log helpers+tests; not every receipt view wired |
| R10 Integration | Partial | Batch HTTP; bank-core stub; webhook retry incomplete |
| R11 Demo ops | Present | Demo Bank `is_demo` + bank_demo UI + standalone bank-simulator + `pilot:seed-history` + witness in `demo:up` |
| P1–P12 | Partial | See table below |
| Website E | Partial | Preview only; await founder |

---

## Demo drivers (post remove-demo-mode)

| Command | Target |
|---------|--------|
| `pnpm demo:up` | Local Postgres + normal API + `pilot:provision-demo-tenant` + `pilot:seed-history` |
| `pnpm bank-simulator` / `pnpm demo:rehearse` | Standalone simulator → governed intake on `is_demo` tenant (real timers) |
| `pnpm demo:fresh` | wipe → provision → seed (same path as hosted) |

---

## R1–R11 detail

| ID | Status | Evidence / note |
|----|--------|-----------------|
| R1.1 Schema; HTTP 400 | Present | `bank/validate.ts`, `routes/bank-events.ts` |
| R1.2 Idempotency | Present | `bank_case` unique (org, idempotency_key) |
| R1.3 Persist after field policy | Present | `handle-event.ts` |
| R1.4 Decision response | Present | allow\|hold\|stop + ids; sealed event_id when key exists |
| R2.1–R2.2 all_matching / combine | Present | Opt-in; golden baseline unchanged |
| R2.3 content_hash / published immutability | Present | Activate hashes; published refuse mutate |
| R2.4 Record-only | Present | Workflow flag + evaluate would_have; batch forceRecordOnly |
| R2.5 Simulate | Partial | Exists; bank sample UX incomplete |
| R2.6 Dual-approver publish | Partial | Table + `dual_publish_required` wire; full UX incomplete |
| R3.* Authority | Present | Pack seed via `pack:apply` |
| R4.1–R4.4 Role/SoD/fields | Present (unit + console guards + HTTP) | `console-approval-http.integration.test.ts` officer 403 / manager 200; bank-simulator + demo:rehearse |
| R4.5 Escalation / clock | Present | Real system clock + `escalate_to_role`; `pnpm demo:prove-escalation-2min` |
| R4.6 Delegation | Present | Time-bound `approval_delegate` (migration 016); outside the window the delegate gets 403 (scenario 10 `delegateAfter=403`) |
| R5.* Receipts / append-only | Present | Migrations 014/015; issue + seal |
| R6.* Verifier | Present | `tools/aegis-verify` |
| R7.* Field policy | Present | + leak tests / scenario 8 |
| R8.2–R8.4 Canned CSV | Present | `canned-reports.ts` + console Reports page (stub label removed) |
| R9.2 Access log | Partial→helpers Done | Tests for log/list; not every view |
| R10.3 Bank-core stub | Present (labelled stub) | `examples/bank-core-stub` |
| R10.4 Measured latency | Present | Raw output **only** in FINAL_REPORT § latency |
| R11.1–R11.4 Demo ops | Present | `demo:up` / `pilot:provision-demo-tenant` / `pilot:seed-history` / `bank-simulator` / `demo:fresh` (no demo mode) |

---

## GO-message inventory (accept-before-done)

| Item | Status | Test / evidence |
|------|--------|-----------------|
| Batch CSV/JSONL record-only | **Done** | `batch import` tests + `POST .../events/batch` |
| Tenant isolation | **Done** | `TestOrgIsolation` (events, bank_case, forensic_receipt) |
| Role enforcement every endpoint | **Partial** | route auth matrix test covers console + aegis routes; not every mutate route has its own role middleware |
| Record-only mode tests | **Done** | `bank-evaluate` record-only cases + batch commit |
| Access-log tests | **Done** | `receipt access log` unit tests |
| Backup/restore + verify | **Done** | `pnpm backup-restore-drill` (`tools/backup-restore-drill/run.mts`); restored receipts verify |
| Threat model | **Done** | `docs/THREAT_MODEL.md` |
| Retention / legal hold | **Done** | Phase 6 legal hold purge tests |
| OIDC role mapping | **Done** | `src/auth/oidc-claim-mapper.ts` + `oidc-claim-mapper.test.ts` |
| Demo clock on receipts | **Removed** | Demo clock deleted; receipts use system Clock only |
| Canned reports + CSV | **Done** | API + real Reports page (stub label removed) |

---

## Production hardening (P1–P12)

| ID | Status | Note |
|----|--------|------|
| P1 KeyProvider | Partial | AWS KMS Ed25519 signer (`kms-ed25519.ts`), production boot guards, custody recorded in receipts (`docs/KEY_CUSTODY.md`); live KMS Sign proof waits on founder AWS credentials |
| P2 RFC 3161 | Partial | Client + local test TSA; public TSA via `AEGIS_TSA_URL` (Sectigo recommended, no SLA); live public-TSA proof waits on the founder setting the URL |
| P3 Approver notifications | Partial | Safe payload + unit; real email/Teams delivery waits on staging credentials |
| P4 Identity / OIDC mapping | Present | `oidc-claim-mapper.ts` + tests + `docs/OIDC_ROLE_MAPPING.md` |
| P5 Batch import | Present | HTTP record-only |
| P6 Operability | Partial | Health/ready + backup → restore → verify drill Present; remaining operability work is listed in FINAL_REPORT 2.9 and `docs/OPERABILITY.md` |
| P7 Security | Partial | Threat model + SBOM workflow; more hardening open |
| P8 OpenAPI + Java/C# | Partial | OpenAPI + smoke; Java/C# generate and smoke scripts exist (container), not yet gated in CI |
| P9 Load test | Present | Script; figures only in FINAL_REPORT |
| P10 Legal hold + retention | Present | |
| P11 Docs | Present | FINAL / GAP / DEMO / DECISIONS / WEBSITE_CHANGES |
| P12 i18n | Partial | `en.json` present; **not fully wired** |

---

## Website (E)

| ID | Status | Note |
|----|--------|------|
| W0–W2 Claims / structure | Partial / Present | Honesty pass + `/banks`; see WEBSITE_CHANGES; **unsupported copy still listed there** |
| W8 Live publish | **Not done** | By design |

---

## Scenario readiness (1–12)

| Path | Status |
|------|--------|
| In-API `scenario:run` / `scenario:live` | **Removed** — use `pnpm bank-simulator` + `pnpm demo:rehearse` against an `is_demo` tenant |
| Standalone bank simulator | **Present** — `tools/bank-simulator` drives governed intake with real timers |

---

## Still not done / present (single list)

Corrected after implementation pass (explore inventory of “Missing” for escalate/delegation/release/HTTP 3–7/marketing was **stale**).

| Item | Status |
|------|--------|
| Backup → restore → verify drill | **Present** — `tools/backup-restore-drill/run.mts` |
| Console/aegis route auth matrix | **Partial** — `test/console-route-auth-matrix.test.ts` (+ forensic-role-auth) passes; not every mutate route has its own role middleware |
| Reports UI | **Present** — real canned CSV + filters (stub label removed) |
| OIDC claim → role | **Present** — `src/auth/oidc-claim-mapper.ts` + tests + `docs/OIDC_ROLE_MAPPING.md` |
| Production RFC 3161 TSA | **Present client** — `requestRfc3161Timestamp` / `AEGIS_TSA_URL`; ops TSA still customer-provided |
| KeyProvider AWS/GCP/Vault Sign | **Present** — `key-provider.ts` calls SDKs when creds exist |
| Approver email / Teams | **Present path** — Resend + Teams webhook; needs staging config for E2E proof |
| Webhook retry | **Present** — `webhooks/retry.ts` + exponential backoff in `dispatch.ts` |
| escalate_to_role | **Present** — console guard + route |
| Time-bound delegation | **Present** — `approval_delegate` + migration 016 |
| Hard-stop release HTTP | **Present** — `POST …/approvals/:id/release` |
| `--approvals=http` 2–7,5,9–12 | **Present** — extended live runners; rehearse via `pnpm demo:rehearse` |
| `demo:up` / `demo:rehearse` | **Present** — normal API + `pilot:provision-demo-tenant` / `pilot:seed-history`; rehearse drives `bank-simulator` (no runtime demo mode) |
| Bundle export + chain-5 + verify/tamper | **Present** — `export:scenario-bundles` (all receipt scenarios + chain-5) |
| Provisional receipt badge | **Present** — API `flags.provisional` + console sealed/provisional badge |
| Policy diff endpoint | **Present** — `GET /v1/console/policies/:id/diff?against=` |
| Java/C# OpenAPI clients | **Present scripts** — `pnpm generate:openapi-clients` / `smoke:openapi-clients` |
| UI i18n | **Partial** — `lib/i18n.ts` + nav/`en.json`; not every page string |
| Dual-publish UX | **Partial** — banner on policies page + governance toggle |
| Marketing claims (preview) | **Corrected** — see WEBSITE_CHANGES |
| Website **live publish** | **Not done** (by design) |

---

## Next

Keep this file and FINAL_REPORT / DEMO in lockstep after each accept-before-done pass.
