# Final report — forensic demo readiness

**Branch:** `forensic-demo-readiness`  
**Baseline tag:** `pre-forensic-demo`  
**Date:** 2026-11-15  
**Honesty rule:** Status is Present / Done only when implemented and tested. This branch must not deploy to salanor.com.  
**Keep in sync with:** `docs/GAP_REPORT.md`, `docs/DEMO.md`.

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
| `… scenario:live -- --approvals=http` | Same + real authenticated approval path for **2, 3, 4, 6, 7** |
| `pnpm --filter aegis-api export:scenario-bundles` | Export DB receipts for 1–3, 8 → verify → tamper fails |

---

## 2. Per-scenario: APS seal vs fixture

| # | Scenario | Live receipt / seal | Approvals |
|---|----------|---------------------|-----------|
| 1 | allow AUTH-RL | **Real APS** event + forensic receipt | n/a |
| 2 | hold credit_manager | **Real APS** + receipt | fixture guards; **HTTP mode** = real endpoints |
| 3 | LN-07 model override | **Real APS** + receipt | fixture guards |
| 4 | dual approver reject | Fixture only | fixture |
| 5 | repeated self-approval | Fixture only | fixture |
| 6 | PAY-03 callback | Fixture only | fixture |
| 7 | hard stop release | Fixture only | fixture |
| 8 | data access field policy | **Real APS** + receipt | fixture |
| 9 | policy v4 dual publish | Fixture (hash / dual-publish logic) | n/a |
| 10 | escalation + expiry clock | Fixture (demo clock) | n/a |
| 11 | unreachable modes | Fixture | n/a |
| 12 | receipt bundle + tamper | **In-memory** signed fixtures (not DB APS) | n/a |

---

## 3. GO gap inventory

| Item | Status | Evidence |
|------|--------|----------|
| Batch CSV/JSONL record-only | **Done** | `runBatchImport` + `POST …/events/batch`; batch import tests |
| Tenant isolation | **Done** | `TestOrgIsolation` + `ForensicOrgIsolation` bank_case/receipt |
| Role enforcement every endpoint | **Partial** | governed/batch 401 + report 403; not all console routes |
| Record-only tests | **Done** | evaluate + batch commit tests |
| Access-log tests | **Done** | `receipt access log` tests |
| Backup/restore + verify | **Not done** | — |
| Threat model | **Done** | `docs/THREAT_MODEL.md` |
| Retention / legal hold | **Done** | Phase 6 legal hold purge tests |
| OIDC role mapping | **Partial** | Doc only |
| Demo clock on receipts | **Done** | `demo_clock flags` tests |
| Canned reports + CSV | **Done** | API + Stub UI |

---

## 4. Still not done (complete list)

1. Backup → restore → verified bundle drill  
2. Exhaustive role tests on **every** console/aegis endpoint  
3. OIDC claim → console/authority role automation + tests  
4. **Production RFC 3161 timestamp authority** (local test TSA only today)  
5. **Managed key vault / cloud KMS signing complete** (P1 KeyProvider partial; AWS/GCP/Vault Sign incomplete)  
6. **Approver notification delivery** in production config (email/Teams end-to-end)  
7. Webhook retry delivery service  
8. **Escalation to a role** (`escalate_to_role`) end-to-end  
9. **Time-bound delegation**  
10. **Java and C# OpenAPI clients** generated + CI smoke  
11. **UI translations** fully wired (P12 `en.json` partial)  
12. Dual-publish UX complete; console bank ladder on every approval click polish  
13. Website **live publish** (founder approval)  
14. Unsupported marketing claims still in UI (see §7) — **do not publish**  
15. Expand `--approvals=http` beyond scenario 2 to 3–7 if required for pilot theatre  
16. Release-after-hard-stop as a first-class authenticated HTTP route (if required beyond fixture scenario 7)  

---

## 5. Measured latency (raw load-test only — do not copy elsewhere)

Command (this machine, demo API on `:8080`, DB `5435`, `INGEST_RATE_LIMIT_PER_MIN=100000`):

`BENCH_N=1000 BENCH_CONCURRENCY=20 AEGIS_INGEST_KEY=… pnpm tsx tools/bench/load-test.mts`

```
machine { cpus: 12, ram_gb: 34, node: 'v22.19.0', platform: 'win32' }
bench_config { base: 'http://localhost:8080', n: 1000, concurrency: 20 }
{
  label: 'transport_auth_reject',
  n: 1000,
  concurrency: 20,
  errors: 0,
  p50_ms: 37.81,
  p95_ms: 113.49,
  p99_ms: 195.94,
  mean_ms: 50.93,
  wall_throughput_rps: 392.71,
  wall_ms: 2597.35,
  observed_rps: 385.01,
  data_size: 'POST /v1/aegis/bank/events with invalid Bearer (expect 401)'
}
{
  label: 'full_decision_bank_events',
  n: 1000,
  concurrency: 20,
  errors: 0,
  p50_ms: 397.39,
  p95_ms: 1139.16,
  p99_ms: 1323,
  mean_ms: 470.97,
  wall_throughput_rps: 42.47,
  wall_ms: 23709.88,
  observed_rps: 42.18,
  data_size: 'single synthetic loan_decision ~0.5KB body'
}
{
  label: 'delta_full_minus_transport_p50_ms',
  p50_delta_ms: 359.58,
  note: 'Approximate full-decision excess over auth-reject transport overhead; not a published SLA.'
}
```

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
| `aegis-ledger-sdk` full | Fail (shared env/schema) | Fail (same class) | Not forensic |
| `id` / `insurance-api` | Fail (env/session) | Fail (env/session) | Not forensic |

Live HTTP approvals after migrate 016/017 on demo DB `:5435`: **PASS** scenarios 2,3,4,6,7 (`scenario:live --approvals=http 2,3,4,6,7`).

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

## 7. Website claims not supported by code (corrected wording — do not publish)

| Current claim (UI/copy) | Problem | Corrected wording |
|-------------------------|---------|-------------------|
| Hero / visual `<5ms` SDK intercept | No measured figure supports absolute &lt;5ms | Remove number, or “SDK intercept — measured latency only after a published bench run” |
| Hero `BYOK` | Full KeyProvider / all KMS paths incomplete | “Customer-controlled signing keys where configured (register public key; sign in your KMS or agent)” |
| `PLATFORM_DATA_POINTS` value `BYOK` | Same | Same softening |
| `SOC 2 · EU AI` without “mapping” | Not a certification | “SOC 2 / EU AI Act **control mapping** in exports — mapping, not certification” |
| Unqualified “BYOK signing” on security page | Partial | “Customer-held keys supported for verify; server Sign via AWS/GCP/Vault is partial / stub where noted” |
| FedRAMP as if available | Roadmap only | Keep “architecture path / not authorized” (trust page already clearer than hero) |
| Trace reconstruction “&lt;1s” / “milliseconds” as guarantee | Not a published SLA | “Interactive trace reconstruction in Console” (no absolute time) |
| “60s Merkle witness” as guarantee | Configurable cadence | “Default witness worker cadence 60s (configurable) — not a durability guarantee” |

See also `docs/WEBSITE_CHANGES.md`. **No live publish from this branch.**

---

## 8. Stubs (remain labelled)

| Surface | Label |
|---------|--------|
| Console `/aegis/reports` | **Stub** |
| Canned report API | `stub: true` / `X-Report-Stub` |
| `examples/bank-core-stub` | Demo stub |
| AWS KMS Sign / prod TSA | Incomplete / local test |

---

## 9. Commands

```powershell
pnpm scenario:run
$env:AEGIS_INGEST_KEY=$env:AEGIS_INGEST_DEV_KEY
pnpm --filter aegis-api scenario:live
pnpm --filter aegis-api scenario:live -- --approvals=http
$env:BENCH_N="1000"; $env:BENCH_CONCURRENCY="20"
pnpm tsx tools/bench/load-test.mts
```
