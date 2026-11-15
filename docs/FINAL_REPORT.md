# Final report — forensic demo readiness

**Branch:** `forensic-demo-readiness`  
**Baseline tag:** `pre-forensic-demo`  
**Date:** 2026-11-15  
**Honesty rule:** Status is Present only when implemented and tested. This branch must not deploy to salanor.com.

---

## Executive summary

The forensic / bank-pilot spine is implemented on a dedicated branch with a known-good tag, golden policy baseline preserved, opt-in rule combine, authority packs, governed event intake (`allow`/`hold`/`stop`), forensic receipts + offline verifier, approval guards, demo packs (banking + insurance), and website claim honesty.  

**Not complete:** full DB-backed `scenario run all` from a clean production-like reset with seeded demo users; Java/C# generated client live smoke against a running server; production TSA (only local test TSA); full webhook retry delivery service; measured latency figure (script exists, no published number without a run).

---

## 1. Requirement status

### R1–R11

| ID | Status | Notes |
|----|--------|-------|
| R1 Event intake | Present (Partial seal) | `POST /v1/aegis/governed/events` (+ `/bank/events` alias); HTTP 400; idempotent `bank_case`; APS-1 seal when org agent key exists, else provisional citation |
| R2 Policy engine | Present (Partial dual-publish UX) | `combine: all_matching` opt-in; content_hash; published immutability; `dual_publish_required` wired on activate |
| R3 Authority matrix | Present | Data-driven; demo packs only; no engine defaults |
| R4 Approvals | Present (Partial clock/delegation) | Role level, SoD, required fields, release; console wired; escalation/delegation incomplete |
| R5 Receipts | Present | Derived receipts cite sealed events; tenant seq; append-only migration 015 |
| R6 Verifier | Present | `pnpm aegis-verify`; scenario-12 tamper matrix |
| R7 Field policy | Present | store/mask/hash/evaluate_only/omit; insurance E2E leak check |
| R8 Search/reports | Partial | Existing trace search; canned CSV reports not new |
| R9 Admin/security | Partial | Auditor + receipt access log table + helpers |
| R10 Integration | Partial | Batch dry-run; `onUnreachable`; bank-core stub; notify delivery log unit; webhook retry incomplete |
| R11 Demo ops | Partial | `scenario:run all` (12 unit); `demo:reset` with prod guard; DB E2E seed theatre incomplete |

### Section C / genericity

| Item | Status |
|------|--------|
| Golden evaluate-rules unchanged | Present |
| Scenarios 1–12 unit runner | Present |
| Multi-tenant insurance E2E (pack only) | Present |
| No real institution names (product surface) | Present |
| Policy packs + template | Present |
| DB-backed scenario reset theatre | Missing |

### P1–P12

| ID | Status |
|----|--------|
| P1 KeyProvider | Partial | local (prod refuse) + env; AWS KMS Sign stub |
| P2 RFC 3161 | Partial | Local test TSA + verifier report of absence |
| P3 Notifications | Partial | Safe hold payload + retry/delivery log unit tests |
| P4 Identity | Partial | `docs/OIDC_ROLE_MAPPING.md` + existing SSO |
| P5 Batch import | Present | CSV/JSONL dry-run tested |
| P6 Operability | Partial | Health/ready exist; runbook incomplete |
| P7 Security | Partial | Threat model; Gitleaks + SBOM workflow added |
| P8 OpenAPI / clients | Partial | OpenAPI 0.1.0 + smoke test; generate instructions for Java/C# |
| P9 Performance | Partial | `tools/bench/load-test.mts` — **no latency figure published** |
| P10 Data lifecycle | Partial | Legal hold + retention exist |
| P11 Docs | Present | DEMO, INTEGRATION, GAP, DECISIONS, FINAL, WEBSITE_CHANGES, OIDC |
| P12 i18n | Partial | `en.json` present; not fully wired in UI |

### Website E

| Item | Status |
|------|--------|
| W0–W1 claims | Present | Honesty pass + WEBSITE_CHANGES |
| W2 structure | Present | Problem / Check-Decide-Prove / example / FAQ / banks page |
| W8 live publish | Not done (by design) | Preview only; await founder approval |

---

## 2. Files and modules (high level)

| Area | Path |
|------|------|
| Migrations | `014_forensic_bank.sql`, `015_forensic_receipt.sql` |
| Packs | `services/aegis-api/src/packs/` (`demo.banking`, `demo.insurance`, template) |
| Governed intake | `src/bank/*`, `seal-decision.ts`, routes `/governed/events` |
| Forensic | `src/forensic/*` (receipt, verify, issue, rfc3161, access-log) |
| Verifier CLI | `tools/aegis-verify/` |
| Demo | `scenario-run-cli`, `reset-cli`, `pack:apply` |
| Tests | bank-*, forensic-*, multi-tenant-pack, no-institution-names, rfc3161, notify, openapi-smoke |
| Marketing | homepage sections + `/banks`, claim cleanup |
| CI | `.github/workflows/security-sbom.yml` |

---

## 3. Commands

```powershell
# Scenarios (unit)
pnpm scenario:run -- all

# Verifier
pnpm aegis-verify -- path\to\bundle.json --keys path\to\keys.json

# Tests (core)
pnpm --filter aegis-api exec vitest run test/evaluate-rules.golden.test.ts
pnpm --filter aegis-api exec vitest run test/bank-evaluate.test.ts test/forensic-receipt.test.ts test/multi-tenant-pack.e2e.test.ts test/no-institution-names.test.ts test/rfc3161.test.ts test/notify-approvers.test.ts

# Migrate / pack / reset (demo DB only)
pnpm db:migrate
pnpm --filter aegis-api pack:apply -- --pack banking --org <uuid>
$env:AEGIS_DEMO_MODE="true"; pnpm --filter aegis-api demo:reset -- --org <uuid>

# Bench (only publish numbers from this output)
pnpm tsx tools/bench/load-test.mts
```

---

## 4. Measured latency

**None published.** Run the bench script against a live demo API and paste machine + p50/p95/p99 here before any website claim.

---

## 5. Do not say in demos or on the website

- SOC 2 / EU AI Act **certification**
- Any latency (including “&lt;5ms”) without bench output
- HIPAA / FedRAMP as available
- That all 12 scenarios passed from a clean DB reset theatre
- That every decision is APS-sealed if the org has no signing agent (provisional citation may apply)
- Real customer or bank names as product claims

---

## 6. Decisions differing from the original GO message

| ID | Summary |
|----|---------|
| D1 | Extend APS-1; derived receipts cite sealed events |
| D2 | hold only for human-approval obligations |
| D3 | `all_matching` opt-in |
| D5 | Demo clock/reset production guard |
| D6/D9 | Append-only on hash-chain fields; retention redaction allowed |
| D7 | Defaults unchanged for existing tenants |
| D8 | Website preview only |
| D10 | Genericity — packs only; no sector hard-coding |

---

## 7. Website claims changed

See `docs/WEBSITE_CHANGES.md`: mapping-not-certification; removed unqualified &lt;5ms/BYOK hero metrics; sector-neutral ICP; `/banks` for banking detail; FAQ and Check/Decide/Prove sections added. **Await founder approval before live publish.**

---

## 8. Still open (explicit)

1. Full demo theatre: seed users + `demo:reset` + live API scenarios 1–12  
2. Generate and CI-smoke Java/C# OpenAPI clients against demo server  
3. Production RFC 3161 TSA (not local test)  
4. End-to-end approver email/Teams delivery in production config  
5. Canned CSV reports + i18n wiring through console UI  
6. Publish measured latency after a real bench run  
