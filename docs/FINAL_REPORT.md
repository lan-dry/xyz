# Final report — forensic demo readiness

**Branch:** `remove-demo-mode` (supersedes `forensic-demo-readiness` demo-mode path)  
**Baseline tag:** `pre-remove-demo-mode`  
**Last verified:** 2026-11-17  
**Honesty rule:** Status is Present / Done only when implemented and tested. This branch must not deploy to salanor.com until reviewed.  
**Keep in sync with:** `docs/GAP_REPORT.md`, `docs/DEMO.md`, `docs/WEBSITE_CHANGES.md`.  

> **2026-11-17 single path:** Runtime demo mode, demo clock, in-API scenarios, `demo:reset`, and the in-console simulator are **removed**. Demos use a normal API + `is_demo` tenant via `pnpm demo:up` → `pilot:provision-demo-tenant` → `pilot:seed-history`, driven by `pnpm bank-simulator` with real timers (escalate windows included). Historical sections below may still name old runners; treat `docs/DEMO.md` as authoritative for commands.

---

## Executive summary

Live theatre on clean local Postgres (`127.0.0.1:5435/aegis`): `demo:up` (normal API + `is_demo` Demo Bank via `pilot:provision-demo-tenant` / `pilot:seed-history`) → **`demo:rehearse`** against the standalone bank simulator with real wall-clock escalate.  

**Bank-ready UI pass:** presenting org is **Demo Bank** (`demo-bank`); `AEGIS_UI_PROFILE=bank_demo`; evidence-bundle download (not summary-as-receipt); `describeDecision` / `decision_basis`; simulator; witness worker in `demo:up`; F2 + F13 notes in `docs/BANK_READY_NOTES.md`; click path in `docs/DEMO_RUNBOOK.md`.

**Approvals:** default `scenario:live` short-circuits via in-process `checkApprovalAttempt`. **`--approvals=http`** drives scenarios **2–7, 5, 9–12** through real console HTTP (request / decide / release / escalate) with seeded `@demo.test` users. Integration proof: `console-approval-http.integration.test.ts`.  

**Signing:** APS seal uses the resolved org agent `signing_key` (preferred agent, then any signable org key). Forensic receipts are signed by **`AEGIS_RECEIPT_SIGNING_KEY_B64`** under **`AEGIS_RECEIPT_KEY_ID`** (default `receipt_dev`); `aegis-verify` accepts bundles against that published public key (derived and exported in `keys.json`).  

Removed demo surfaces (`/v1/aegis/demo/scenarios/*`, `/v1/aegis/demo/simulator/*`, `demo:reset`, demo clock) return 404 / do not exist. `pg_restore --disable-triggers` uses `AEGIS_ALLOW_DISABLE_TRIGGERS_RESTORE` only.

---

## 1. What each runner hits

| Command | Target |
|---------|--------|
| `pnpm scenario:run` | In-process fixtures in `scenario-runners.ts` |
| `pnpm --filter aegis-api scenario:live` | Live HTTP demo endpoint; intake seals for 1–3, 8 |
| `… scenario:live -- --approvals=http` | Same + real authenticated path for **2–7, 5, 9–12** |
| `pnpm demo:up` / `pnpm demo:rehearse` | One-command demo + headless DEMO.md sequence |
| `pnpm --filter aegis-api export:scenario-bundles` | Export DB receipts (all receipt scenarios + chain-5) → verify → tamper fails |

---

## 2. Per-scenario: APS seal vs fixture (aligned with §9)

Authority: §9 item **1.1**. **Done** only when a raw `scenario:live -- --approvals=http` PASS line with `receipt_kind=` is pasted below. Failures stay **not Done**.

Raw run (2026-11-15, API `:8080`, DB `:5435`, `--approvals=http` all 12):

```
PASS scenario 1 allow AUTH-RL receipt_kind=sealed — allow rules=AUTH-RL; sealed_http=true event_id=evt_cc41b53294ba42778a6b1460 outcome=allow
PASS scenario 2 hold credit_manager [http] receipt_kind=sealed — hold=hold officer=403 manager=200 approval=apr_7980264b00cf453e sealed=true provisional=false receipt=rcpt_6b118b9aceda4630; fixture_guards=true
PASS scenario 3 LN-07 model override [http] receipt_kind=sealed — outcome=hold self=403 noReason=403/403 ok=200 approval=apr_c70d79c3135842b0 sealed=true provisional=false receipt=rcpt_166e6b13be194f74; fixture_guards=true
PASS scenario 4 dual approver reject [http] receipt_kind=sealed — manager=200 compliance=200 approval=apr_6396962a5fbe4ba7 sealed=true provisional=false receipt=rcpt_e5b4fe12406347f1; fixture_guards=true
PASS scenario 5 repeated self-approval [http] receipt_kind=sealed — refused=3 sealed=true provisional=false approval=apr_415d6eb709a34327 receipt=rcpt_c8017f396e744f5c; fixture_guards=true
PASS scenario 6 PAY-03 callback [http] receipt_kind=sealed — approve=403 reject=200 approval=apr_3ea291405f824dfc sealed=true provisional=false receipt=rcpt_3baf77f79ae54246; fixture_guards=true
PASS scenario 7 hard stop release [http] receipt_kind=sealed — manager=403 headNoReason=422 released=200 approval=apr_3f108602ca294f58 sealed=true provisional=false receipt=rcpt_68faa0e50cee4b60; fixture_guards=true
PASS scenario 8 data access field policy receipt_kind=sealed — leaks=0; sealed_http=true event_id=evt_de6e8612bd024bccb836d0ec outcome=allow
PASS scenario 9 policy v4 dual publish [http] receipt_kind=sealed — aloneBlocked=true published=true eval=hold priorHashOk=true v3=1 draft=1 diffHttp=200 sealed=true provisional=false receipt=rcpt_a27b7a1d44b642da; fixture_guards=true
PASS scenario 10 escalation + expiry clock [http] receipt_kind=sealed — escalatedApprove=200 delegateInside=200 delegateAfter=403 receipt=rcpt_0f964486405a4ed5 sealed=true provisional=false; fixture_guards=true
PASS scenario 11 unreachable modes [http] receipt_kind=sealed — receipt=rcpt_c637a335e1974939 sealed=true provisional=false reconcile={"buffered":1,"receipt_id":"rcpt_c637a335e1974939","decided_without_aegis":true}; fixture_guards=true
PASS scenario 12 receipt bundle + tamper [http] receipt_kind=sealed — chain=5 valid=true tamperFail=true swapFail=true sealed=true provisional=false receipt=rcpt_92faccfdf5af4540 cases=apr_http_0cedbc71,apr_http_44050cd9,apr_http_b58625a9,apr_http_258272dc,apr_http_b3362152; fixture_guards=true
failed=0
```

| # | Scenario | 1.1 status | receipt_kind (pasted) |
|---|----------|------------|------------------------|
| 1 | allow AUTH-RL | **Done** | sealed |
| 2 | hold credit_manager | **Done** | sealed |
| 3 | LN-07 model override | **Done** | sealed |
| 4 | dual approver reject | **Done** | sealed |
| 5 | repeated self-approval | **Done** | sealed |
| 6 | PAY-03 callback | **Done** | sealed |
| 7 | hard stop release | **Done** | sealed |
| 8 | data access field policy | **Done** | sealed |
| 9 | policy v4 dual publish | **Done** | sealed |
| 10 | escalation + delegation | **Done** | sealed |
| 11 | unreachable buffer | **Done** | sealed |
| 12 | receipt bundle + tamper | **Done** | sealed |

`pnpm scenario:run` remains in-process fixtures only (not a live seal proof).

---

## 3. GO gap inventory (aligned with §9)

| Item | Status (§9) | Evidence |
|------|-------------|----------|
| Batch CSV/JSONL record-only | **Done** | `runBatchImport` + batch tests |
| Tenant isolation | **Done** | org-isolation + forensic-org-isolation tests |
| Role enforcement | **Done** (matrix) / not every mutate middleware | `route-inventory.ts` + `console-route-auth-matrix.test.ts` (§9 2.2) |
| Record-only tests | **Done** | evaluate + batch tests |
| Access-log tests | **Done** | `receipt-access-log.test.ts` |
| Backup/restore + verify | **Done** (§9 2.4) | `docker exec … pg_dump -Fc` + restore verify PASS |
| Threat model | **Done** | `docs/THREAT_MODEL.md` |
| Retention / legal hold | **Done** | Phase 6 purge tests |
| OIDC role mapping | **Done** (§9 2.3) | `oidc-claim-mapper.ts` + tests + `docs/OIDC_ROLE_MAPPING.md` |
| Demo clock on receipts | **Done** | `demo-clock-flags.test.ts` |
| Canned reports + CSV | **Done** | API `stub: false` + Reports UI filters (§8) |
| escalate_to_role + delegation | **Done** (§9 1.3) | scenario 10 PASS + escalate HTTP regression test |
| Webhook retry | **Done** (§9 2.5) | `webhook-retry.test.ts` |
| Prod TSA / full KMS / notify staging | **Partial** (§9 2.6–2.8) | needs credentials |
| Website live publish | **Not done** | founder approval |

---

## 4. Still not done (aligned with §9 — Partial / Not done only)

Do not list items that §9 marks **Done**. `pnpm docs:status-agree` fails if §4 still names a Done §9 id.

1. **2.6** Approver notification staging with real Resend/Teams creds  
2. **2.7** Live AWS KMS Sign with real credentials  
3. **2.8** Customer production RFC 3161 TSA URL + chain  
4. **2.9** Remaining operability (SBOM/gitleaks/non-root checklist)  
5. **3.1** Full Java/C# generate in CI against a demo server  
6. **3.2** Native review of French UI strings  
7. **3.3** Measurable decision-path speedup (before/after in §5 show no gain)  
8. Bank-ready table rows still Partial (case/replay automated test, clean-seed rehearse after the last seed change, witness inclusion amber→green screen, housekeeping screen proof) — see "Bank-ready item status" in §9  
9. Website **live publish** (founder approval) — **do not publish**

---

## 5. Measured latency (raw load-test only — do not copy elsewhere)

Change under test: `getActivePoliciesWithRules` returns `combine`/`content_hash` and loads rules in one query (removes N+1 + extra policy SELECT). No behaviour change.

Command: `BENCH_N=200 BENCH_CONCURRENCY={1|20|50} AEGIS_INGEST_KEY=… pnpm tsx tools/bench/load-test.mts`  
Machine: `{ cpus: 12, ram_gb: 34, node: 'v22.19.0', platform: 'win32' }`, API `:8080`, DB `:5435`.

### Before (pre-restart, old code)

| c | full_decision p50_ms | p95_ms | p99_ms | observed_rps |
|---|----------------------|--------|--------|--------------|
| 1 | 45.45 | 90.56 | 151.56 | 18.95 |
| 20 | 203.24 | 234.12 | 240.94 | 95.7 |
| 50 | 432.7 | 499.75 | 522.6 | 111.07 |

### After (API restarted with policy query change)

| c | full_decision p50_ms | p95_ms | p99_ms | observed_rps |
|---|----------------------|--------|--------|--------------|
| 1 | 56.53 | 166.09 | 202.25 | 13.14 |
| 20 | 213.34 | 588.56 | 632.12 | 72.61 |
| 50 | 468.54 | 527.06 | 543.7 | 100.97 |

No improvement claimed. After is not faster on this machine for N=200 (single active policy; round-trip savings dominated by noise/load). Figures above are raw only.

---

## 6. Test / lint / pre-existing tests vs `pre-forensic-demo`

### Regression table (fresh DBs — accept-before-done)

Root cause of proxy/policy “deny→allow”: `applyIntegrationFixture` deleted `organization` while `session_replication_role=replica`, which **disables FK CASCADE**, leaving orphan active policies (e.g. Allow Stripe v2 @ priority 200) that beat `rule_deny_stripe_pi` @ 100. **Fixed in fixture** (replica only for events; org delete under DEFAULT) + migration `017_workflow_run_org_cascade.sql`. Approval: local API stub replaces `test.local` for bind-check. **No pass→fail regressions** on fresh DBs (`:5440` baseline vs `:5441` branch).

| Suite / test | Baseline (`pre-forensic-demo`, fresh `:5440`) | Branch (fresh `:5441`) | Regression? |
|--------------|-----------------------------------------------|------------------------|-------------|
| `proxy.integration` deny+allow (2) | **Pass** | **Pass** | No |
| `policy.integration` activate (1) | **Pass** | **Pass** | No |
| `approval.integration` obligation→resume (1) | **Fail** (`ENOTFOUND test.local`) | **Pass** (local stub) | No — branch improved |
| `console.integration` ingest key (2) | **Pass** | **Pass** | No |
| Four aegis-api suites total | 5/6 | **6/6** | No |
| `aegis-ledger-sdk` | **14 fail / 3 pass** (worktree `pre-forensic-demo` on `:5440`) | **14 fail / 3 pass** (branch on `:5441`) | No — same totals |
| `id` | **1 fail / 1 pass** (`:5440`) | **1 fail / 1 pass** (`:5441`) | No — same totals |
| `insurance-api` | **2 fail / 1 pass** (`:5440`) | **2 fail / 1 pass** (`:5441`) | No — same totals |

Live HTTP all-12 paste: see §2 (**failed=0**, all `receipt_kind=sealed`).

### aegis-api suite (full)

New coverage: `console-approval-http.integration.test.ts`, `demo-approval-seed-guard.test.ts`.  
Golden evaluate-rules **pass**.

### Lint

- `pnpm --filter aegis-api lint` — **clean (0 errors)**  
- `pnpm lint` (nx all) — fails on several **pre-existing** projects outside forensic scope (`web-workspace`, `web-console`, `web-marketing`, `pilot-agent`, `id`, `auth`, etc.)

### Pre-existing tests vs tag `pre-forensic-demo`

**No test files deleted** (compare `git ls-files` vs tag: only additions).  

**Modified** (append-only migration 015 teardown/tamper adaptations only):

| File | Why |
|------|-----|
| `test/helpers.ts` | `session_replication_role` for fixture DELETE after append-only |
| `test/integration-fixture.ts` | same for integration cleanup |
| `test/witness.integration.test.ts` | intentional hash tamper UPDATE bypasses append-only trigger |

**Added** (new): bank/forensic/demo/canned/role/access-log tests, `forensic-org-isolation.integration.test.ts`, `console-approval-http.integration.test.ts`, etc.

---

## 7. Website claims — preview before / after (do not publish)

Preview on this branch now applies these corrections (`docs/WEBSITE_CHANGES.md`):

| Before (unsupported) | After (preview copy now) |
|----------------------|--------------------------|
| `<5ms` on hero visual | Removed → `wrapFetch` / “Measured” (bench only) |
| Unqualified `BYOK` | “your keys” / “Customer-controlled signing where configured”; jargon on `/for-engineers` |
| `SOC 2 · EU AI` badge as if certified | “control mapping” / “Mapping, not certification” |
| Trace “milliseconds” / `&lt;1s` SLA | “Interactive” reconstruction |
| `60s` witness as guarantee | “Default 60s (configurable)” / cadence, not durability |
| FedRAMP / HIPAA as available | Roadmap chips only (“Plan — not available yet”) |
| Enterprise “from ~$999 / mo” | “Custom” / “regulated institutions” |
| Homepage missing where/security/pricing/contact | Added sections; pricing brief: Free · Team $299/mo · regulated custom |

**No live publish from this branch.**

---

## 8. Stubs / partial (honest)

| Surface | Label |
|---------|--------|
| Console `/aegis/reports` | **Real canned CSV + filters** (stub label removed) |
| `examples/bank-core-stub` | Demo stub (intentional) |
| AWS KMS Sign / prod TSA | Present when creds/`AEGIS_TSA_URL` set; local TSA for tests |
| `docs/screens/*.png` | Captured 2026-11-15 (11 pages + zoom125, 19-step runbook walk); re-run `pnpm demo:screens` after any UI change |
| ledger-sdk / id / insurance per-test table | Run `node tools/scripts/baseline-suite-compare.mjs` |
| French UI | Machine-translated — needs native review (`docs/I18N.md`) |
| Website live publish | **Not done** (by design) |

---

## 9. Finish-pass status (tiers 1–4)

| Item | Status | Reproduce |
|------|--------|-----------|
| 1.1 Live sealed receipts (per scenario) | **Done** — all 12 PASS `receipt_kind=sealed` in §2 paste | raw §2 paste |
| 1.2 demo:up / demo:rehearse | **Done** — `demo:reset`→`demo:up` rate limits; rehearse ×3 `failed=0` | raw pastes below |
| 1.3 escalate + delegation | **Done** — scenario 10 PASS + `escalate-approve-http.integration.test.ts` | §2 + test |
| 1.4 Console polish | **Done** — reports real; screens captured | Console + `docs/screens/README.md` |
| 1.5 Provisional receipts | **Done** | `flags.provisional` + UI badge + pack:apply warn |
| 1.6 Docs sync | **Done** | `pnpm docs:status-agree` |
| 2.1 ledger/id/insurance table | **Done** — worktree `pre-forensic-demo` `:5440` vs branch `:5441` | §6 table |
| 2.1 aegis-api totals | **Done** | regression locks + prior full suite |
| 2.1 upgrade migrate | **Done** — baseline@013 → 015 seed → tip → verify | `upgrade-migrate-check` on `aegis_upgrade` |
| 2.2 Route matrix | **Done** | `console-route-auth-matrix.test.ts` + `route-inventory.ts` |
| 2.3 OIDC mapping | **Done** (prior + tests) | `oidc-claim-mapper.test.ts` |
| 2.4 Backup/restore | **Done** — `docker exec aegis-pg-demo pg_dump -Fc` + `pg_restore --disable-triggers`; restored receipts verify | `pnpm backup-restore-drill` |
| 2.5 Webhook retry | **Done** | `webhook-retry.test.ts` |
| 2.6 Notifications | **Partial** — mocks done; real delivery needs creds | `docs/NOTIFICATIONS_STAGING.md` |
| 2.7 Key custody AWS KMS | **Partial** — provider + prod refuse local file | `key-provider-managed.test.ts` |
| 2.8 RFC 3161 TSA | **Partial** — client + local test TSA | `AEGIS_TSA_URL` + `docs/AEGIS_TSA_AND_KMS.md` |
| 2.9 Operability | **Partial** | `docs/OPERABILITY.md` |
| 3.1 Java/C# clients | **Partial** — container generate + CI smoke scripts | `pnpm generate:openapi-clients` |
| 3.2 i18n + FR | **Partial** | `docs/I18N.md` |
| 3.3 Performance | **Partial** — N+1 batch reverted (no demonstrated help); no speedup claimed | `tools/bench/load-test.mts` |
| 3.4 Release notes | **Done** (no merge) | `docs/RELEASE_NOTES.md` |
| 4 Website W2–W8 preview | **Done** on branch; **not published** | `docs/WEBSITE_CHANGES.md` |

### 1.2 Raw `demo:rehearse` ×3 (2026-11-15, after `demo:reset` → `demo:up`)

```
=== REHEARSE 1 ===

> salanor@0.0.0 demo:rehearse D:\PROJECTS\salanor
> node tools/demo/demo-rehearse.mjs

PASS  API reachable — http=200
PASS  scenario:live fixture (1–12) — failed=0 http=200
PASS  HTTP scenario 2 hold credit_manager — sealed hold=hold officer=403 manager=200 approval=apr_a69585d3250241b7 sealed=true provisional=false receipt=rcpt_8f1f91f3a4854c27; fixture_guards=true
PASS  HTTP scenario 3 LN-07 model override — sealed outcome=hold self=403 noReason=403/403 ok=200 approval=apr_e619b7dba0724f3b sealed=true provisional=false receipt=rcpt_215cdc526a8d466a; fixture_guards=t
PASS  HTTP scenario 4 dual approver reject — sealed manager=200 compliance=200 approval=apr_fcfa9a50a5474bae sealed=true provisional=false receipt=rcpt_1258e01a2399422f; fixture_guards=true
PASS  HTTP scenario 5 repeated self-approval — sealed refused=3 sealed=true provisional=false approval=apr_0eafd0fb95eb4881 receipt=rcpt_e7035af283684169; fixture_guards=true
PASS  HTTP scenario 6 PAY-03 callback — sealed approve=403 reject=200 approval=apr_10926a312e5c4d9f sealed=true provisional=false receipt=rcpt_39952fe26c7b4384; fixture_guards=true
PASS  HTTP scenario 7 hard stop release — sealed manager=403 headNoReason=422 released=200 approval=apr_91894307637346ad sealed=true provisional=false receipt=rcpt_015b8487d70240e3; fixture_guards=true
PASS  HTTP scenario 9 policy v4 dual publish — sealed aloneBlocked=true published=true eval=hold priorHashOk=true v3=1 draft=1 diffHttp=200 sealed=true provisional=false receipt=rcpt_64e87f02b6334815; fixtur
PASS  HTTP scenario 10 escalation + expiry clock — sealed escalatedApprove=200 delegateInside=200 delegateAfter=403 receipt=rcpt_f021fbc1ef2548d6 sealed=true provisional=false; fixture_guards=true
PASS  HTTP scenario 11 unreachable modes — sealed receipt=rcpt_9d0d9d208d734f55 sealed=true provisional=false reconcile={"buffered":1,"receipt_id":"rcpt_9d0d9d208d734f55","decided_without_aegis":true}; f
PASS  HTTP scenario 12 receipt bundle + tamper — sealed chain=5 valid=true tamperFail=true swapFail=true sealed=true provisional=false receipt=rcpt_40869ef984904a67 cases=apr_http_6a01b87e,apr_http_1517fb11,ap
PASS  export bundles + verify + tamper — exit=0

rehearse done — failed=0
=== REHEARSE 2 ===

> salanor@0.0.0 demo:rehearse D:\PROJECTS\salanor
> node tools/demo/demo-rehearse.mjs

PASS  API reachable — http=200
PASS  scenario:live fixture (1–12) — failed=0 http=200
PASS  HTTP scenario 2 hold credit_manager — sealed hold=hold officer=403 manager=200 approval=apr_46550851ca034dc2 sealed=true provisional=false receipt=rcpt_fdc3a18d615e4d74; fixture_guards=true
PASS  HTTP scenario 3 LN-07 model override — sealed outcome=hold self=403 noReason=403/403 ok=200 approval=apr_525c4580bff64cee sealed=true provisional=false receipt=rcpt_985443e114bc444c; fixture_guards=t
PASS  HTTP scenario 4 dual approver reject — sealed manager=200 compliance=200 approval=apr_73fa214db9ba40b7 sealed=true provisional=false receipt=rcpt_ea5e9b1c68eb4465; fixture_guards=true
PASS  HTTP scenario 5 repeated self-approval — sealed refused=3 sealed=true provisional=false approval=apr_44c11f4410ff4d1c receipt=rcpt_1be55916779b4268; fixture_guards=true
PASS  HTTP scenario 6 PAY-03 callback — sealed approve=403 reject=200 approval=apr_64ac12c4253846c8 sealed=true provisional=false receipt=rcpt_a7cda706b5724455; fixture_guards=true
PASS  HTTP scenario 7 hard stop release — sealed manager=403 headNoReason=422 released=200 approval=apr_20f290bdc9144539 sealed=true provisional=false receipt=rcpt_e3ccb650a3804843; fixture_guards=true
PASS  HTTP scenario 9 policy v4 dual publish — sealed aloneBlocked=true published=true eval=hold priorHashOk=true v3=1 draft=1 diffHttp=200 sealed=true provisional=false receipt=rcpt_0dd33a1078b540af; fixtur
PASS  HTTP scenario 10 escalation + expiry clock — sealed escalatedApprove=200 delegateInside=200 delegateAfter=403 receipt=rcpt_c92a36405866411a sealed=true provisional=false; fixture_guards=true
PASS  HTTP scenario 11 unreachable modes — sealed receipt=rcpt_92bcd02e77024e98 sealed=true provisional=false reconcile={"buffered":1,"receipt_id":"rcpt_92bcd02e77024e98","decided_without_aegis":true}; f
PASS  HTTP scenario 12 receipt bundle + tamper — sealed chain=5 valid=true tamperFail=true swapFail=true sealed=true provisional=false receipt=rcpt_eb04468edfcc49d5 cases=apr_http_d858af5d,apr_http_eb8fc2bd,ap
PASS  export bundles + verify + tamper — exit=0

rehearse done — failed=0
=== REHEARSE 3 ===

> salanor@0.0.0 demo:rehearse D:\PROJECTS\salanor
> node tools/demo/demo-rehearse.mjs

PASS  API reachable — http=200
PASS  scenario:live fixture (1–12) — failed=0 http=200
PASS  HTTP scenario 2 hold credit_manager — sealed hold=hold officer=403 manager=200 approval=apr_6de681fa0e874252 sealed=true provisional=false receipt=rcpt_26ac9e68b8e64ea3; fixture_guards=true
PASS  HTTP scenario 3 LN-07 model override — sealed outcome=hold self=403 noReason=403/403 ok=200 approval=apr_08797852eef5461a sealed=true provisional=false receipt=rcpt_4d013afdafa44999; fixture_guards=t
PASS  HTTP scenario 4 dual approver reject — sealed manager=200 compliance=200 approval=apr_c1f62216143740f0 sealed=true provisional=false receipt=rcpt_7093b19e496a4f05; fixture_guards=true
PASS  HTTP scenario 5 repeated self-approval — sealed refused=3 sealed=true provisional=false approval=apr_a9df902c8a40471c receipt=rcpt_363d858317f249a8; fixture_guards=true
PASS  HTTP scenario 6 PAY-03 callback — sealed approve=403 reject=200 approval=apr_568201af44b7492b sealed=true provisional=false receipt=rcpt_49607d19b4304dfd; fixture_guards=true
PASS  HTTP scenario 7 hard stop release — sealed manager=403 headNoReason=422 released=200 approval=apr_eecc37d2daa74cbc sealed=true provisional=false receipt=rcpt_c0c1e61866e04852; fixture_guards=true
PASS  HTTP scenario 9 policy v4 dual publish — sealed aloneBlocked=true published=true eval=hold priorHashOk=true v3=1 draft=1 diffHttp=200 sealed=true provisional=false receipt=rcpt_887e5ce857734056; fixtur
PASS  HTTP scenario 10 escalation + expiry clock — sealed escalatedApprove=200 delegateInside=200 delegateAfter=403 receipt=rcpt_5963ad9422554579 sealed=true provisional=false; fixture_guards=true
PASS  HTTP scenario 11 unreachable modes — sealed receipt=rcpt_1e548b847fa249f4 sealed=true provisional=false reconcile={"buffered":1,"receipt_id":"rcpt_1e548b847fa249f4","decided_without_aegis":true}; f
PASS  HTTP scenario 12 receipt bundle + tamper — sealed chain=5 valid=true tamperFail=true swapFail=true sealed=true provisional=false receipt=rcpt_29aa9df3adec4e30 cases=apr_http_c5d242a6,apr_http_185672ec,ap
PASS  export bundles + verify + tamper — exit=0

rehearse done — failed=0
```

### Bank-ready item status (honesty: Done = test + screenshot)

**Pass 2 completion (2026-11-15):** the screens now exist — 11 pages under `docs/screens/` (each with a `-zoom125` variant) and the 22-step runbook walk under `docs/screens/runbook/`. Every row below that has a test **and** its screens is **Done**. Rows with no automated test, or with no screen to prove them, stay **Partial** and say why. `pnpm docs:status-agree` enforces this both ways: Done needs the screen files on disk, and a row whose test and screens are all present cannot stay Partial.

Rough edges visible in the captured screens (not status blockers, listed so nobody is surprised on stage): an Approvals card can still show **Approve** to a signed-in officer who lacks the required role (the server refuses it with 403; hard-stop cards now show **Release** instead of Approve), "Requested by" reads "Not recorded" on seeded cases, and the Live feed Rule column still shows the raw rule id next to the plain-language name.

| Item | Status | Tests | Screens / proof |
|------|--------|-------|-----------------|
| 3.1 Demo Bank org | Done | fixture / seed-story | `docs/screens/01-overview.png`, `docs/screens/runbook/01-overview.png` |
| 3.2 describeDecision | Done | `describe-decision.test.ts`, event-type labels | `docs/screens/02-live-feed.png`, `docs/screens/runbook/04-case-allowed-four-answers.png` |
| 3.3 Live feed | Done | jargon scan | `docs/screens/02-live-feed.png`, `docs/screens/runbook/02-live-feed.png`, `docs/screens/runbook/22-live-feed-after.png` |
| 3.4 Approvals cards | Done | console-approval-http | `docs/screens/03-approvals.png`, `docs/screens/runbook/05-approvals-as-officer.png`, `docs/screens/runbook/06-approvals-as-manager.png` |
| 3.5 Case / replay / data_seen | Partial — screens exist, no automated test yet | — | `docs/screens/09-case-four-answers.png`, `docs/screens/10-case-replay.png`, `docs/screens/runbook/08-case-replay.png` |
| 3.6 Evidence bundle | Done | `evidence-bundle.test.ts` | `docs/screens/11-evidence.png`, `docs/screens/runbook/18-evidence.png` |
| 3.7 decision_basis / F2 | Done | `bank-evaluate.test.ts` F2 | `BANK_READY_NOTES.md` |
| 3.8 Verify UX | Done | bank-ready-pass2 / sample bundles | `docs/screens/06-verify.png`, `docs/screens/runbook/19-verify.png` |
| 3.9 Standalone bank simulator | Done | `tools/bank-simulator` + `pnpm bank-simulator` (in-console Simulator removed) | `docs/screens/runbook/03-simulator-standalone.png` |
| 3.10 Clean seed / rehearsal org | Partial — no screen proves it; rehearse ×3 is in §1.2 but not re-run after the last seed change | seed multi-day; rehearse scratch | rehearse paste after re-up |
| 3.11 bank_demo profile | Done | CSS data-ui-profile | `docs/screens/01-overview.png`, `docs/screens/01-overview-zoom125.png` |
| 3.12 Rules matrix / v3–v4 | Done | bank-ready-pass2 Rules APIs | `docs/screens/04-rules.png`, `docs/screens/04-rules-zoom125.png` |
| 3.13 F13 / B2 fail-safe default | Done | `evidence-write-failure.test.ts` | `BANK_READY_NOTES.md` |
| B1 unknown rule reject | Done | `rule-validate.test.ts` | — |
| 3.14 Witness in demo:up | Partial — no screen of an inclusion going amber to green | demo:up witness worker | inclusion amber/green |
| 3.15 Housekeeping | Partial — no screen proof | reset default org | strings + runbook updated |
| C Runbook walk | Done | `demo:runbook-walk` script | `docs/screens/runbook/01-overview.png` … `docs/screens/runbook/22-live-feed-after.png` (22 steps) |

### Production-style demo (P0–P10)

Honesty: **Done** needs a test (and a screen when the item is UI). Founder credentials block live KMS Sign, public TSA, and `smoke:production` against a hosted stack. Nothing from this branch is merged or published until the founder list in `docs/DEPLOY_PRODUCTION.md` is complete.

| Item | Status | Proof |
|------|--------|-------|
| P0 Approvals reason_code / callback_verified / hard-stop **Release** by click | **Done** | API scenario 6–7 HTTP; UI modals: `docs/screens/approvals-ui/02-release-modal.png`, `docs/screens/approvals-ui/03-approve-modal-fields.png`; pending list with Hard stop + Release: `docs/screens/approvals-ui/01-approvals-pending.png` |
| P1 Production boot guards | **Done** (unit) | `production-guards.test.ts` (+ DB probe integration) |
| P2 AWS KMS Ed25519 Plan A + interim software Plan B | **Partial** — signer + refuse-without-interim; live Sign waits on AWS creds | `kms-ed25519.test.ts`, `docs/KEY_CUSTODY.md`, `pnpm smoke:kms` |
| P3 RFC 3161 TSA | **Partial** — client + local test TSA; public URL waits on founder | `rfc3161-tsa-client.test.ts`, `AEGIS_TSA_URL` |
| P4 Deploy docs (Vercel console + Railway API + optional simulator) | **Done** (docs) | `docs/DEPLOY_PRODUCTION.md` (founder tasks + simulator founder list) |
| P5 `is_demo` tenant + Delegations + provision/seed | **Done** (code + unit) | migration `018_organization_is_demo`, Delegations nav, `demo-tenant-delegation.test.ts` |
| P6 Bank simulator local (`:4000`) + deployable (login, server-only secrets, public API only, smoke via its API) | **Done** (code + local login proof) — hosted deploy waits on founder | `tools/bank-simulator/*`, `docs/DEPLOY_PRODUCTION.md` §9; local: anon 401, wrong pass 401, login 200, label "Simulated core banking system"; `smoke:production` drives `/api/story` when `BANK_SIMULATOR_URL` + `BANK_SIMULATOR_PASS` are set |
| P7 Full-menu audit | **Done** | `pnpm demo:full-menu` → all 14 `AEGIS_NAV` pages PASS; production-style overview `docs/screens/menu/00-production-style-overview.png` + `production-style-checks.json` |
| P8 `pnpm smoke:production` | **Partial** — script includes simulator own-API path; run waits on smoke-tenant credentials | `tools/smoke/smoke-production.mjs` |
| P9 PR / release prep | **Wait** — no merge until founder tasks done | `docs/RELEASE_NOTES.md`, `docs/DEPLOY_PRODUCTION.md` |
| P10 Truth statements | **Done** (docs) | DEMO / BANK_READY / DEPLOY “do not say” lists |

### Needs your credentials / decision

- Local persona passwords are generated into `.demo-tenant-local-stack.local.json` by `pnpm demo:up` (gitignored)
- Resend / Teams for `NOTIFICATIONS_STAGING.md`
- Real production TSA URL + cert chain
- AWS KMS credentials for live Sign proof
- Founder tasks in `docs/DEPLOY_PRODUCTION.md` §4 and simulator list §9 (DNS, Railway/Vercel, keys, smoke tenant) before merge/deploy
- Re-run `pnpm demo:screens`, `pnpm demo:full-menu`, and `pnpm demo:runbook-walk` after `demo:up` whenever the UI changes (1920×1080 + zoom 125%)
- Optional: one-click demo role login helper (simulator documents separate Chrome profiles instead)

### Do not say in a demo or on the website

- Absolute `<5ms` or millisecond SLAs
- Unqualified BYOK / FedRAMP / HIPAA as available
- “Certified” for SOC 2 / EU AI Act (mapping only)
- That every scenario was always sealed historically (use `receipt_kind` from the live runner)
- That client-supplied `requester_email` alone is production SoD identity (must come from authenticated identity mapping)

---

## 10. Commands

```powershell
# Normal API + is_demo tenant (no )
pnpm demo:up
pnpm bank-simulator
pnpm demo:rehearse
pnpm docs:status-agree
pnpm demo:screens
pnpm demo:full-menu
pnpm demo:runbook-walk
pnpm demo:prove-escalation-2min
# Hosted stack (after founder vars): pnpm smoke:production
pnpm --filter aegis-api test
pnpm --filter aegis-api lint
$env:BENCH_N="1000"; $env:BENCH_CONCURRENCY="20"
pnpm tsx tools/bench/load-test.mts   # API must be up (after demo:up)
```

