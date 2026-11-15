# Gap report — forensic readiness and bank pilot

**Branch:** `forensic-demo-readiness`  
**Baseline tag:** `pre-forensic-demo`  
**Date:** 2026-11-15  
**Last phase completed:** Genericity addendum (policy packs + multi-tenant insurance E2E)  
**Method:** Code audit against R1–R11, section C tests, P1–P12, and website workstream E. Status values: **Present** / **Partial** / **Missing**.

This file is updated at the end of each phase. Nothing is marked Present unless implemented and tested.

---

## Phase checkpoints

| Phase | Status | Notes |
|-------|--------|-------|
| 0 Baseline / branch / tag | Done | `pre-forensic-demo` tag; golden evaluate-rules tests |
| 1 Engine / adapter / matrix / field policy | Done | Unit tests green; bank route evaluate+persist case; sealing into APS receipt deferred to Phase 2 |
| 2 Approvals / receipts / aegis-verify | Partial | Receipts + aegis-verify + scenario 1/2/3/6/7/12 unit runner; console approval guards wired; provisional event hash (full APS seal still open) |
| 3 Integration / batch import | Partial | Batch CSV/JSONL dry-run + `onUnreachable` alias; webhook retry / bank-core stub incomplete |
| 4 Search / admin UI / i18n | Pending | |
| 5 P1–P10 hardening | Pending | |
| 6 Demo ops / DEMO.md | Partial | `scenario:run` covers 1,2,3,6,7,12 unit-level; full DB reset scenarios open |
| 7 Website | Partial | Claim honesty pass started; `docs/WEBSITE_CHANGES.md`; no live publish |

---

## Summary

| Area | Overall | Notes |
|------|---------|-------|
| R1 Event intake | Partial | `POST /v1/aegis/bank/events` + 400 validation + idempotent `bank_case`; APS seal/link still Phase 2 |
| R2 Policy engine | Partial | `combine: all_matching` opt-in + content_hash on activate + published immutability; dual publish still Missing |
| R3 Authority matrix | Partial | Table + ladder + retail_loan RWF defaults + unit tests; demo seed CLI still Phase 6 |
| R4 Approvals | Partial | Bank role/SoD/required-field guards unit-tested; not yet wired into console approval HTTP path |
| R5 Evidence | Partial | Forensic receipt schema + tenant seq + append-only migration 015; bank path seal+issue wiring incomplete |
| R6 Verifier | Partial | `tools/aegis-verify` + `verifyForensicBundle` tamper matrix (scenario 12) Present in unit tests |
| R7 Field policy | Partial | store/mask/hash/evaluate_only/omit implemented + leak tests; not yet wired end-to-end on sealed receipt |
| R8 Search / reports | Partial | Trace search + timeline; no canned reports / full facets / CSV |
| R9 Admin / security | Partial | Auditor + audit_log + SSO wedge |
| R10 Integration | Partial | HMAC webhook + buffer; no retry log, bank-core stub, named onUnreachable |
| R11 Demo ops | Missing / Partial | `pilot:reset` only; no scenario 1–12, demo clock |
| P1–P12 Hardening | Partial / Missing | BYOK and benches partial; most P* missing |
| Website E | Partial | Marketing site present; claims need honesty pass |

---

## R1 Event intake

| ID | Status | Files | Note |
|----|--------|-------|------|
| R1.1 Schema; HTTP 400 machine-readable | Partial | `bank/validate.ts`, `routes/bank-events.ts` | Bank events → **400** machine-readable; APS ingest still 422 |
| R1.2 Idempotency | Partial | `bank/repo.ts` unique `(org, idempotency_key)` | Concurrent conflict → single case; integration proof still open |
| R1.3 Persist after field policy | Partial | `bank/field-policy.ts`, `handle-event.ts` | Applied before `bank_case.attributes`; APS seal still Phase 2 |
| R1.4 Decision response contract | Partial | `bank/types.ts`, `handle-event.ts` | allow\|hold\|stop + case/decision/receipt ids; `event_id`/`hash` filled in Phase 2 |

## R2 Policy engine

| ID | Status | Files | Note |
|----|--------|-------|------|
| R2.1 Evaluate all matching rules | Present | `policy/evaluate-rules.ts` | Opt-in `combine: all_matching`; legacy golden baseline unchanged |
| R2.2 Combine hard stop / hold union / allow | Present | `evaluate-rules.ts`, `bank/evaluate.ts` | Hard stop / deny → stop; holds union; matrix overlay |
| R2.3 Immutable published policy + content_hash | Partial | `repo/policies.ts`, `bank/policy-hash.ts` | content_hash on activate; update/delete of published refused + audit; dual publish Missing |
| R2.4 Record-only mode | Partial | `014_forensic_bank.sql`, `bank/evaluate.ts` | Workflow `record_only` default false; evaluate returns would_have; queue skip Phase 2 |
| R2.5 Rule test / simulate | Partial | `repo/policy-simulate.ts`, console | Simulate exists; not bank sample-event against draft with matched rules list |
| R2.6 Dual-approver policy publish | Missing | `policy_publish_approval` table ready | Activate still single admin |

## R3 Authority matrix

| ID | Status | Files | Note |
|----|--------|-------|------|
| R3.1 Matrix as data + view | Partial | `authority_matrix` table, `bank/authority-matrix.ts` | Match + most-restrictive; console view Phase 4 |
| R3.2 retail_loan RWF seed | Partial | `DEFAULT_RETAIL_LOAN_*` | Code defaults + `seedRetailLoanAuthority`; demo org seed Phase 6 |
| R3.3 Role or-above ladder | Partial | `bank_role_ladder`, `roleSatisfies` | Levels tested; approval-time check Phase 2 |

## R4 Approvals

| ID | Status | Files | Note |
|----|--------|-------|------|
| R4.1 Role + level at approve time | Partial | `routes/console/approvals.ts` | Org Approver role; no bank level stored on receipt |
| R4.2 Separation of duties | Partial | `repo/approvals.ts` | Email self-approve blocked; refusal not always timeline/audit written |
| R4.3 Distinct multi-slot | Partial | `approval_vote` | Org required_approvers count; not per-rule role slots |
| R4.4 Required fields per rule | Missing | approvals route | Free-text reason only |
| R4.5 Escalation / expiry / clock | Partial | housekeeping, governance settings | Expiry + escalate notify; no escalate_to_role; no injectable clock |
| R4.6 Time-bound delegation | Missing | reassign only | Manual reassign, no deputy period |

## R5 Evidence

| ID | Status | Files | Note |
|----|--------|-------|------|
| R5.1 §2.4 receipt | Partial | share receipt UI, events | APS-1 events; no forensic receipt document |
| R5.2 Tenant seq + prev_hash | Partial | `ingest/persist.ts` | Per org+agent sequence |
| R5.3 Key id / rotation / keyset | Partial | signing_key, BYOK, compliance public-keys.json | Bridge rotate; not full KeyProvider |
| R5.4 Signed checkpoints | Partial | witness batch + sign-checkpoint | Merkle root sig, not {tenant,seq,head_hash,time} |
| R5.5 Append-only triggers | Missing | — | UPDATEs exist (resign, retention) |

## R6 Verifier

| ID | Status | Files | Note |
|----|--------|-------|------|
| R6.1 Offline aegis-verify | Missing | marketing stub only | tools/verifier is online |
| R6.2 receipt.json --keys | Missing | SDK verify helpers | No CLI |
| R6.3 Bundle chain + seq gaps | Partial | aegis-ledger-sdk verify-export-pack | No seq-gap report |
| R6.4 Case bundle + HTML/PDF | Partial | compliance ZIP | No case receipt HTML/PDF |
| R6.5 Tamper tests named | Partial | witness + tamper samples | Incomplete matrix from section C |

## R7 Sensitive data

| ID | Status | Files | Note |
|----|--------|-------|------|
| R7.1 Field policy modes | Present | `bank/field-policy.ts`, migration 014 | store/mask/hash/evaluate_only/omit unit-tested |
| R7.2 No clear hash/omit in receipts/logs | Partial | leak helper tested | End-to-end receipt/log scan in scenario 8 (Phase 2/6) |
| R7.3 Scenario 8 demonstration | Missing | — | |
| R7.4 Retention without breaking verify | Partial | retention-purge.ts | Needs redaction-preserving-hash design |

## R8 Search and reporting

| ID | Status | Files | Note |
|----|--------|-------|------|
| R8.1 Search facets | Partial | live/search, repo/traces | Limited filters |
| R8.2 Canned reports | Missing | — | |
| R8.3 Timeline | Present | traces/[traceId], span-tree | |
| R8.4 CSV export | Partial | evidence exports | Not report CSV |

## R9 Administration

| ID | Status | Files | Note |
|----|--------|-------|------|
| R9.1 Roles enforced | Partial | platform-auth org roles | Bank roles missing |
| R9.2 Receipt view access log | Partial | auditor_access_log / share counts | Not full who/what/when on every receipt view |
| R9.3 Admin audit | Present | audit_log, logs page | |
| R9.4 Auth behind interface / SSO | Partial | WorkOS / id service | Claim→role ladder mapping incomplete |
| R9.5 Deploy modes documented | Partial | docker-compose Postgres+Redis; Fly docs | Not one-command full stack |

## R10 Integration

| ID | Status | Files | Note |
|----|--------|-------|------|
| R10.1 Webhook HMAC + retry log | Partial | webhooks/dispatch.ts | HMAC present; retry/backoff log incomplete |
| R10.2 Client onUnreachable | Partial | signed-buffer, wrap-fetch fail modes | Names differ |
| R10.3 Bank-core stub | Missing | — | |
| R10.4 Measured latency | Partial | tools/aegis-p3-bench | Must remeasure and publish only measured numbers |

## R11 Demo operations

| ID | Status | Files | Note |
|----|--------|-------|------|
| R11.1 reset (demo-guarded) | Partial | pilot:reset | Not bank seed; no production guard yet |
| R11.2 scenario run 1–12 | Missing | pilot-agent named scenarios | |
| R11.3 Demo UI pages | Partial | console pages | Reports / matrix / access log incomplete |
| R11.4 Demo clock / mode / unreachable | Missing | — | |

---

## Production hardening (P1–P12)

| ID | Status | Note |
|----|--------|------|
| P1 KeyProvider | Partial | Dev keys + BYOK/KMS pieces; no unified KeyProvider + env refuse |
| P2 RFC 3161 | Missing | |
| P3 Approver notifications | Partial | Email/Slack for anomalies/approvals; needs held-case required-approver notify without sensitive fields |
| P4 Identity claim→ladder | Partial | SSO exists |
| P5 Batch import adapter | Missing | |
| P6 Operability | Partial | Health fragments; need Prometheus, startup validation, backup restore proof |
| P7 Security hardening | Partial | Auth on console; need CI secret scan, SBOM, threat model |
| P8 OpenAPI + Java/C# | Missing | |
| P9 Load test report | Partial | Bench scripts exist |
| P10 Legal hold + redaction purge | Partial | Retention exists |
| P11 Docs | Partial | Many docs; DEMO.md / honest security overview missing |
| P12 UI i18n file | Missing | Hard-coded English strings |

---

## Website (E)

| ID | Status | Note |
|----|--------|------|
| W0 Claim audit | Pending | Source: `apps/web-marketing` |
| W1 Claims change | Pending | Badge, latency, HIPAA/FedRAMP honesty |
| W2–W8 Structure / banks page / preview | Pending | Live publish forbidden |

---

## Scenario readiness (1–12)

All **Missing** as numbered scenarios. Closest: pilot refund/payout/data-access demos under `apps/pilot-agent`.

---

## Next update

After Phase 1 commit: mark R1–R3–R7 items that land as Implemented now (with test references).
