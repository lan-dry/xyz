# Final report — forensic demo readiness (in progress)

**Branch:** `forensic-demo-readiness`  
**Baseline tag:** `pre-forensic-demo`  
**Date:** 2026-11-15  

Honesty rule: nothing below is marked done unless implemented and tested. This branch must not deploy to salanor.com.

---

## 1. Requirement status

### R1–R11 (summary)

| ID | Status | Notes |
|----|--------|-------|
| R1 Bank intake | Partial | `POST /v1/aegis/bank/events`, HTTP 400, idempotent `bank_case`; provisional event hash (full APS seal incomplete) |
| R2 Policy engine | Partial | `combine: all_matching` opt-in; content_hash on activate; published immutability; dual-publish Missing |
| R3 Authority matrix | Partial | Table + retail_loan defaults + tests; demo seed CLI incomplete |
| R4 Approvals | Partial | Role/SoD/required-field guards + console wiring; escalation clock/delegation incomplete |
| R5 Receipts | Partial | Signed forensic receipt + tenant seq + append-only migration; cites sealed event refs |
| R6 aegis-verify | Partial | CLI + scenario-12 tamper matrix unit tests Present |
| R7 Field policy | Partial | Modes + leak helper tested; scenario 8 E2E Missing |
| R8 Search/reports | Missing / Partial | Existing trace search only |
| R9 Admin/security | Partial | Auditor roles exist; access log table for receipts added |
| R10 Integration | Partial | Batch import dry-run; `onUnreachable`; bank-core stub; webhook retry incomplete |
| R11 Demo ops | Partial | `scenario:run all` passes unit-level scenarios 1–12; full DB reset E2E Missing |

### Section C tests

| Area | Status |
|------|--------|
| Golden evaluate-rules baseline unchanged | Present |
| all_matching / matrix / field policy / record-only unit | Present |
| Scenario 12 tamper matrix | Present (unit) |
| Idempotency concurrent DB proof | Partial |
| Tenant isolation / role on every endpoint | Partial (existing tests + new guards) |
| Scenarios 1–12 unit runner | Present (`pnpm scenario:run -- all`) |
| Scenarios 1–12 DB-backed E2E from reset | Missing |

### P1–P12

| ID | Status |
|----|--------|
| P1 KeyProvider | Partial | Interface + local (prod refuse) + env; AWS KMS Sign not fully wired |
| P2 RFC 3161 | Missing |
| P3 Approver notifications | Missing / Partial | Existing notify paths; no full email+webhook+delivery log for bank holds |
| P4 Identity / OIDC example | Missing as dedicated doc |
| P5 Batch import | Partial | Parser + dry-run tested |
| P6 Operability | Partial | Health/ready already exist |
| P7 Security / threat model | Partial | `docs/THREAT_MODEL.md`; CI secret scan / SBOM incomplete |
| P8 OpenAPI + Java/C# clients | Missing |
| P9 Performance | Partial | `tools/bench/load-test.mts` (no figure published without a measured run) |
| P10 Data lifecycle | Partial | Legal hold + retention exist; purged-bundle verify incomplete |
| P11 Docs | Partial | DEMO, INTEGRATION_GUIDE, WEBSITE_CHANGES, GAP_REPORT, DECISIONS |
| P12 UI i18n | Partial | `apps/web-console/src/locales/en.json` added; not wired through UI |

### Website E

| Item | Status |
|------|--------|
| W0 claim audit | Present in `docs/WEBSITE_CHANGES.md` |
| W1 claim honesty | Partial (metrics + compliance copy updated) |
| W2–W6 homepage /banks rewrite | Partial hero copy only |
| W8 no live publish | Honoured |

---

## 2. Files / modules added or changed (high level)

- `services/aegis-api/migrations/014_forensic_bank.sql`, `015_forensic_receipt.sql`
- `services/aegis-api/src/bank/*` (evaluate, field policy, matrix, validate, batch, approvals)
- `services/aegis-api/src/forensic/*` (receipt, verify-bundle, issue)
- `services/aegis-api/src/crypto/key-provider.ts`
- `tools/aegis-verify/`, `tools/bench/load-test.mts`
- `examples/bank-core-stub/`
- `docs/GAP_REPORT.md`, `DECISIONS.md`, `DEMO.md`, `WEBSITE_CHANGES.md`, `THREAT_MODEL.md`, `INTEGRATION_GUIDE.md`
- Marketing claim cleanup under `apps/web-marketing`

---

## 3. Commands

```powershell
pnpm scenario:run -- all
pnpm aegis-verify -- path\to\bundle.json --keys path\to\keys.json
pnpm --filter aegis-api exec vitest run test/evaluate-rules.golden.test.ts
pnpm --filter aegis-api exec vitest run test/bank-evaluate.test.ts test/forensic-receipt.test.ts test/bank-approvals-guard.test.ts test/bank-batch-import.test.ts test/key-provider.test.ts
pnpm tsx tools/bench/load-test.mts   # needs AEGIS_INGEST_KEY for measured numbers
```

Migrate (demo DB only): `pnpm db:migrate` (applies 014/015).

---

## 4. Measured latency

**None published.** Run `tools/bench/load-test.mts` against a live demo API and paste the JSON output here. Do not quote "<5ms" on the website until that run exists.

---

## 5. Statements that must NOT be made

- SOC 2 / EU AI Act **certification**
- "<5ms" (or any latency) without the bench script output
- HIPAA / FedRAMP as available products
- That all twelve scenarios pass from a clean DB reset (unit runner only for 1,2,3,6,7,12 today)
- That bank decisions are fully APS-1 sealed end-to-end (provisional citation only)

---

## 6. Decisions differing from the GO message

- **D9:** Append-only on `event` locks hash-chain identity fields only (allows retention redaction + legacy resign).
- Website copy awaits founder approval; no live publish (D8).

---

## 7. Website claims changed

See `docs/WEBSITE_CHANGES.md`. Summary: removed unqualified "<5ms"/BYOK hero metrics; compliance notes say "Mapping, not certification"; HIPAA/FedRAMP labelled as plans; hero copy moved toward plain-language W2.

---

## Remaining work (do next)

1. Full APS-1 seal on bank decisions (replace provisional hash)
2. DB-backed `reset` + scenarios 4,5,8,9,10,11
3. Dual-approver policy publish
4. OpenAPI + Java/C# clients
5. RFC 3161, notification delivery log, CI secret/SBOM scans
6. `/banks` page + full homepage W2 structure on preview only
