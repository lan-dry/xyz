# Final report — forensic demo readiness

**Branch:** `forensic-demo-readiness`  
**Baseline tag:** `pre-forensic-demo`  
**Last verified:** 2026-11-15  
**Honesty rule:** Status is Present / Done only when implemented and tested. This branch must not deploy to salanor.com.  
**Keep in sync with:** `docs/GAP_REPORT.md`, `docs/DEMO.md`, `docs/WEBSITE_CHANGES.md`.  
**Commits this finish pass:** `410202f` (T1), `55795c4` (T2–T4 docs/website).

---

## Executive summary

Live theatre on clean local Postgres (`127.0.0.1:5435/aegis`): migrate → bootstrap → pilot fixture (agent signing keys) → banking pack → API (`AEGIS_DEMO_MODE` + receipt signing) → **`scenario:live` 12/12 PASS**. Intake 1–3, 8 seal real APS-1 events + forensic receipts.  

**Approvals:** default `scenario:live` short-circuits via in-process `checkApprovalAttempt`. **`--approvals=http`** drives scenario 2 through real `POST /approvals/request` + console login + `POST /approvals/:id/approve` (officer **403**, manager **200**) with seeded `@demo.test` users (`pack:apply` auto-seeds when demo mode is on, or `--seed-approvers`). Integration proof: `console-approval-http.integration.test.ts`.  

Demo endpoint `POST /v1/aegis/demo/scenarios/run` requires `AEGIS_DEMO_MODE=true` and is **unavailable** when `NODE_ENV` or `AEGIS_ENV` is `production` (`isDemoModeAllowed()`).

`pnpm scenario:run` = **in-process fixtures only** (no HTTP, no DB).

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
PASS scenario 1 allow AUTH-RL receipt_kind=sealed — … outcome=allow
PASS scenario 2 hold credit_manager [http] receipt_kind=sealed — hold=hold officer=403 manager=200 …
FAIL scenario 3 LN-07 model override [http] receipt_kind=sealed — http_approvals_error: approvals/request failed: 500
PASS scenario 4 dual approver reject [http] receipt_kind=none — manager=200 compliance=200 …
PASS scenario 5 repeated self-approval [http] receipt_kind=sealed — refused=3 sealed=true …
PASS scenario 6 PAY-03 callback [http] receipt_kind=none — approve=403 reject=200 …
PASS scenario 7 hard stop release [http] receipt_kind=none — manager=403 headNoReason=422 released=200 …
FAIL scenario 8 data access field policy receipt_kind=provisional — sealed_http=false event_id=evt_gov_…
FAIL scenario 9 policy v4 dual publish [http] — create policy failed: 422 name and rules required
FAIL scenario 10 escalation + expiry clock [http] — escalatedApprove=500 …
FAIL scenario 11 unreachable modes [http] — duplicate key forensic_receipt_organization_id_seq_key
PASS scenario 12 receipt bundle + tamper [http] receipt_kind=none — chain=5 valid=true tamperFail=true swapFail=true
failed=5
```

| # | Scenario | 1.1 status | receipt_kind (pasted) |
|---|----------|------------|------------------------|
| 1 | allow AUTH-RL | **Done** | sealed |
| 2 | hold credit_manager | **Done** | sealed |
| 3 | LN-07 model override | **Not done** (FAIL 500) | sealed (intake only) |
| 4 | dual approver reject | **Done** (PASS; receipt_kind=none) | none |
| 5 | repeated self-approval | **Done** | sealed |
| 6 | PAY-03 callback | **Done** (PASS; receipt_kind=none) | none |
| 7 | hard stop release | **Done** (PASS; receipt_kind=none) | none |
| 8 | data access field policy | **Not done** (FAIL provisional) | provisional |
| 9 | policy v4 dual publish | **Not done** (FAIL 422) | none |
| 10 | escalation + delegation | **Not done** (FAIL) | none |
| 11 | unreachable buffer | **Not done** (FAIL seq) | none |
| 12 | receipt bundle + tamper | **Done** (DB chain tamper) | none (chain verify) |

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
| Backup/restore + verify | **Partial** (§9 2.4) | tool present; this host missing `pg_dump` / tools `pg` resolve |
| Threat model | **Done** | `docs/THREAT_MODEL.md` |
| Retention / legal hold | **Done** | Phase 6 purge tests |
| OIDC role mapping | **Done** (§9 2.3) | `oidc-claim-mapper.ts` + tests + `docs/OIDC_ROLE_MAPPING.md` |
| Demo clock on receipts | **Done** | `demo-clock-flags.test.ts` |
| Canned reports + CSV | **Done** | API `stub: false` + Reports UI filters (§8) |
| escalate_to_role + delegation | **Partial** (§9 1.3) | unit tests present; scenario 10 HTTP FAIL in §2 paste |
| Webhook retry | **Done** (§9 2.5) | `webhook-retry.test.ts` |
| Prod TSA / full KMS / notify staging | **Partial** (§9 2.6–2.8) | needs credentials |
| Website live publish | **Not done** | founder approval |

---

## 4. Still not done (aligned with §9 — partial / not done only)

1. **1.1** Scenarios 3, 8, 9, 10, 11 (FAIL in §2 paste); also receipt_kind=none on 4/6/7/12  
2. **1.2** demo:rehearse green (rate_limit / 500 on this pass)  
3. **1.4** Projector PNG screens under `docs/screens/`  
4. **2.1** Baseline worktree per-test table vs `pre-forensic-demo` (branch results only this pass)  
5. **2.4** Backup/restore drill on a host with `pg_dump` + resolvable `pg`  
6. **2.6** Approver notification staging with real Resend/Teams creds  
7. **2.7** Live AWS KMS Sign with real credentials  
8. **2.8** Customer production RFC 3161 TSA URL + chain  
9. **2.9** Remaining operability (SBOM/gitleaks/non-root checklist)  
10. **3.1** Full Java/C# generate in CI against a demo server  
11. **3.2** Native review of French UI strings  
12. **3.3** Measurable decision-path speedup (before/after in §5 show no gain)  
13. Website **live publish** (founder approval) — **do not publish**

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
| `aegis-ledger-sdk` (branch `:5443`) | (baseline worktree not re-run this pass) | **14 fail / 3 pass** (APS schema validation in verify-export-pack) | Baseline compare incomplete |
| `id` (branch `:5443`) | (baseline not re-run) | **1 fail / 1 pass** (`remote?.userId` undefined) | Baseline compare incomplete |
| `insurance-api` (branch `:5443`) | (baseline not re-run) | **2 fail / 1 pass** (401 expected got 404) | Baseline compare incomplete |

Live HTTP all-12 paste: see §2 (failed=5). Earlier 2,3,4,6,7-only HTTP run had passed; this full run is authoritative for §9 1.1.

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
| `docs/screens/*.png` | Capture checklist only — operator must screenshot |
| ledger-sdk / id / insurance per-test table | Run `node tools/scripts/baseline-suite-compare.mjs` |
| French UI | Machine-translated — needs native review (`docs/I18N.md`) |
| Website live publish | **Not done** (by design) |

---

## 9. Finish-pass status (tiers 1–4)

| Item | Status | Reproduce |
|------|--------|-----------|
| 1.1 Live sealed receipts (per scenario) | **Partial** — Done only for pasted PASS in §2 (1,2,4,5,6,7,12); Fail 3,8,9,10,11 | raw §2 paste |
| 1.2 demo:up / demo:rehearse | **Partial** — demo:up ran (migrate/pack/seed); rehearse failed=6 (rate_limit/500) | see proof paste |
| 1.3 escalate + delegation | **Partial** — unit tests; scenario 10 FAIL in §2 paste | `escalate-to-role.test.ts` + §2 |
| 1.4 Console polish | **Partial** — reports real; screens PNG pending capture | Console + `docs/screens/README.md` |
| 1.5 Provisional receipts | **Done** | `flags.provisional` + UI badge + pack:apply warn |
| 1.6 Docs sync | **Done** | `pnpm docs:status-agree` |
| 2.1 ledger/id/insurance table | **Partial** — branch raw pasted; baseline worktree not re-run this pass | see §6 branch results |
| 2.1 aegis-api totals | **Done** | **211 passed / 1 skipped** on fresh `:5443` |
| 2.1 upgrade migrate | **Done** (paste) | `upgrade-migrate-check` PASS on `:5443` |
| 2.2 Route matrix | **Done** | `console-route-auth-matrix.test.ts` + `route-inventory.ts` |
| 2.3 OIDC mapping | **Done** (prior + tests) | `oidc-claim-mapper.test.ts` |
| 2.4 Backup/restore | **Partial** — tool present; this machine: no `pg_dump` on PATH + `pg` import from tools/ | one-line in proof |
| 2.5 Webhook retry | **Done** | `webhook-retry.test.ts` |
| 2.6 Notifications | **Partial** — mocks done; real delivery needs creds | `docs/NOTIFICATIONS_STAGING.md` |
| 2.7 Key custody AWS KMS | **Partial** — provider + prod refuse local file | `key-provider-managed.test.ts` |
| 2.8 RFC 3161 TSA | **Partial** — client + local test TSA | `AEGIS_TSA_URL` + `docs/AEGIS_TSA_AND_KMS.md` |
| 2.9 Operability | **Partial** | `docs/OPERABILITY.md` |
| 3.1 Java/C# clients | **Partial** — container generate + CI smoke scripts | `pnpm generate:openapi-clients` |
| 3.2 i18n + FR | **Partial** | `docs/I18N.md` |
| 3.3 Performance | **Partial** — before/after pasted in §5; no speedup claimed | `tools/bench/load-test.mts` |
| 3.4 Release notes | **Done** (no merge) | `docs/RELEASE_NOTES.md` |
| 4 Website W2–W8 preview | **Done** on branch; **not published** | `docs/WEBSITE_CHANGES.md` |

### Needs your credentials / decision

- `AEGIS_DEMO_APPROVAL_PASSWORD` for demo:up (no default)
- Resend / Teams for `NOTIFICATIONS_STAGING.md`
- Real production TSA URL + cert chain
- AWS KMS credentials for live Sign proof
- Founder approval before any website publish
- Operator capture of `docs/screens/*.png`
- Fresh-DB baseline table for ledger-sdk / id / insurance (`baseline-suite-compare.mjs`)

### Do not say in a demo or on the website

- Absolute `<5ms` or millisecond SLAs
- Unqualified BYOK / FedRAMP / HIPAA as available
- “Certified” for SOC 2 / EU AI Act (mapping only)
- That every scenario was always sealed historically (use `receipt_kind` from the live runner)

---

## 10. Commands

```powershell
$env:AEGIS_DEMO_APPROVAL_PASSWORD="<secret-min-10>"
$env:AEGIS_DEMO_MODE="true"
pnpm demo:up
pnpm demo:rehearse
pnpm scenario:run
$env:AEGIS_INGEST_KEY=$env:AEGIS_INGEST_DEV_KEY
pnpm --filter aegis-api scenario:live -- --approvals=http
pnpm --filter aegis-api export:scenario-bundles
pnpm docs:status-agree
pnpm --filter aegis-api test   # last: 211 passed, 1 skipped
pnpm --filter aegis-api lint
$env:BENCH_N="1000"; $env:BENCH_CONCURRENCY="20"
pnpm tsx tools/bench/load-test.mts
```

