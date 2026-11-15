# Gap report — forensic readiness and bank pilot

**Branch:** `forensic-demo-readiness`  
**Baseline tag:** `pre-forensic-demo`  
**Date:** 2026-11-15  
**Authority:** Status here must match `docs/FINAL_REPORT.md`. Mark Present / Done only when implemented and tested.  
**Deploy:** Nothing from this branch publishes to salanor.com.

---

## Phase checkpoints

| Phase | Status | Notes |
|-------|--------|-------|
| 0 Baseline / branch / tag | Done | `pre-forensic-demo` tag; golden evaluate-rules tests |
| 1 Engine / adapter / matrix / field policy | Done | Pack-driven; unit + multi-tenant insurance E2E |
| 2 Approvals / receipts / aegis-verify | Done (Partial UX) | APS seal when org agent key exists; forensic receipts; `aegis-verify`; console guards; escalation/delegation incomplete |
| 3 Integration / batch import | Done (Partial delivery) | HTTP batch record-only + dry_run; bank-core stub labelled; webhook retry incomplete |
| 4 Search / admin UI / i18n | Partial | Canned CSV + Stub reports UI; i18n file partial |
| 5 P1–P10 hardening | Partial | Threat model, retention/legal hold, load-test script; backup-restore drill / prod TSA open |
| 6 Demo ops | Done | `scenario:run` in-process; `scenario:live` 12/12 via live HTTP + sealed intake |
| 7 Website | Partial | Claim honesty + `/banks`; **no live publish** |

---

## Summary (aligned with FINAL_REPORT)

| Area | Overall | Notes |
|------|---------|-------|
| R1 Event intake | Present | `/governed/events` + `/bank/events`; sealed when agent key exists |
| R2 Policy engine | Present (Partial dual-publish UX) | `all_matching` opt-in; content_hash; dual_publish_required on activate |
| R3 Authority matrix | Present | Pack data only (`demo.banking` / `demo.insurance`) |
| R4 Approvals | Present (Partial clock/delegation) | Role/SoD/required fields + HTTP session approve test; escalate_to_role / delegation incomplete |
| R5 Evidence | Present | Forensic receipts cite sealed APS events; append-only 015 |
| R6 Verifier | Present | `pnpm aegis-verify`; scenario 12 |
| R7 Field policy | Present | store/mask/hash/evaluate_only/omit + scenario 8 |
| R8 Search / reports | Present (stub UI) | Canned CSV API; console **Stub** page |
| R9 Admin / security | Partial | Access-log helpers+tests; not every receipt view wired |
| R10 Integration | Partial | Batch HTTP; bank-core stub; webhook retry incomplete |
| R11 Demo ops | Present | Live theatre + `demo:reset` + pack:apply |
| P1–P12 | Partial | See table below |
| Website E | Partial | Preview only; await founder |

---

## What `pnpm scenario:run` vs `scenario:live` hit

| Command | Target |
|---------|--------|
| `pnpm scenario:run` | **In-process fixtures** — no HTTP, no DB |
| `pnpm --filter aegis-api scenario:live` | **Live HTTP** `POST /v1/aegis/demo/scenarios/run` (requires `AEGIS_DEMO_MODE=true`); intake 1–3, 8 seal real APS + forensic receipts |

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
| R4.1–R4.4 Role/SoD/fields | Present (unit + console guards + HTTP) | `scenario:live --approvals=http`; `console-approval-http.integration.test.ts` officer 403 / manager 200 |
| R4.5 Escalation / clock | Partial | Demo clock exists; escalate_to_role incomplete |
| R4.6 Delegation | Missing | Manual reassign only |
| R5.* Receipts / append-only | Present | Migrations 014/015; issue + seal |
| R6.* Verifier | Present | `tools/aegis-verify` |
| R7.* Field policy | Present | + leak tests / scenario 8 |
| R8.2–R8.4 Canned CSV | Present (stub UI) | `canned-reports.ts` + console Stub |
| R9.2 Access log | Partial→helpers Done | Tests for log/list; not every view |
| R10.3 Bank-core stub | Present (labelled stub) | `examples/bank-core-stub` |
| R10.4 Measured latency | Present | Raw output **only** in FINAL_REPORT § latency |
| R11.1–R11.4 Demo ops | Present | reset guard, scenario:run + scenario:live, demo clock |

---

## GO-message inventory (accept-before-done)

| Item | Status | Test / evidence |
|------|--------|-----------------|
| Batch CSV/JSONL record-only | **Done** | `batch import` tests + `POST .../events/batch` |
| Tenant isolation | **Done** | `TestOrgIsolation` (events, bank_case, forensic_receipt) |
| Role enforcement every endpoint | **Partial** | governed/batch 401 + report 403; not all console routes |
| Record-only mode tests | **Done** | `bank-evaluate` record-only cases + batch commit |
| Access-log tests | **Done** | `receipt access log` unit tests |
| Backup/restore + verify | **Not done** | — |
| Threat model | **Done** | `docs/THREAT_MODEL.md` |
| Retention / legal hold | **Done** | Phase 6 legal hold purge tests |
| OIDC role mapping | **Partial** | Doc contract; no automated mapper |
| Demo clock on receipts | **Done** | `demo_clock flags` tests |
| Canned reports + CSV | **Done** | API + Stub UI |

---

## Production hardening (P1–P12)

| ID | Status | Note |
|----|--------|------|
| P1 KeyProvider | Partial | local/dev + env; AWS/GCP/Vault Sign incomplete / stubs |
| P2 RFC 3161 | Partial | Local test TSA; **production TSA not done** |
| P3 Approver notifications | Partial | Safe payload + unit; **production email/Teams delivery incomplete** |
| P4 Identity / OIDC mapping | Partial | Doc; automated claim→role incomplete |
| P5 Batch import | Present | HTTP record-only |
| P6 Operability | Partial | Health/ready; **backup restore proof not done** |
| P7 Security | Partial | Threat model + SBOM workflow; more hardening open |
| P8 OpenAPI + Java/C# | Partial | OpenAPI + smoke; **Java/C# clients not generated/CI-smoked** |
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
| Unit `scenario:run` | **Present** — 12/12 in-process |
| Live `scenario:live` | **Present** — 12/12 HTTP; intake 1–3, 8 real APS seal |

---

## Still not done / present (single list)

Corrected after implementation pass (explore inventory of “Missing” for escalate/delegation/release/HTTP 3–7/marketing was **stale**).

| Item | Status |
|------|--------|
| Backup → restore → verify drill | **Present** — `tools/backup-restore-drill/run.mts` |
| Console/aegis route auth matrix | **Present** — `test/console-route-auth-matrix.test.ts` (+ forensic-role-auth); not every mutate route has role middleware |
| OIDC claim → role | **Present** — `src/auth/oidc-claim-mapper.ts` + tests + `docs/OIDC_ROLE_MAPPING.md` |
| Production RFC 3161 TSA | **Present client** — `requestRfc3161Timestamp` / `AEGIS_TSA_URL`; ops TSA still customer-provided |
| KeyProvider AWS/GCP/Vault Sign | **Present** — `key-provider.ts` calls SDKs when creds exist |
| Approver email / Teams | **Present path** — Resend + Teams webhook; needs staging config for E2E proof |
| Webhook retry | **Present** — `webhooks/retry.ts` + exponential backoff in `dispatch.ts` |
| escalate_to_role | **Present** — console guard + route |
| Time-bound delegation | **Present** — `approval_delegate` + migration 016 |
| Hard-stop release HTTP | **Present** — `POST …/approvals/:id/release` |
| `--approvals=http` 2–7,5,9–12 | **Present** — extended live runners; rehearse via `pnpm demo:rehearse` |
| `demo:up` / `demo:rehearse` | **Present** — `pnpm demo:up`, `pnpm demo:rehearse`; `AEGIS_DEMO_APPROVAL_PASSWORD` required (no default) |
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
