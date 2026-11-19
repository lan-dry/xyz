# Forensic readiness mapping

Maps Aegis capabilities to common forensic-readiness elements.  
Each line is checked against code (paths cited). **Built** | **Partial** | **Not built**.

Retention and legal-hold features are inventoried at the end; **do not treat gaps as a build request** — gaps are listed only.

---

## 1. Capture

| Element | Status | Evidence in code |
| --- | --- | --- |
| Sealed decision / event records with payload + attributes | **Built** | `services/aegis-api/src/forensic/seal.ts`, ingest → `event` table |
| Source-signed envelopes (hash + signature at intake) | **Built** | `services/aegis-api/src/ingest/source-envelope.ts`, `test/source-envelope.test.ts` |
| Independently captured ledger/CDC facts (G3) | **Built** (demo path) | `packages/aegis-collector-pg`, `docs/provenance/COLLECTOR.md` |
| Connector-delivered bank intents | **Built** | `packages/aegis-connector`, demo connectors in `tools/demo/` |
| Full network / host / endpoint forensics (EDR dumps, PCAP) | **Not built** | Out of product scope |

---

## 2. Chain of custody

| Element | Status | Evidence in code |
| --- | --- | --- |
| Append-only sealed events (no UPDATE/DELETE of identity/hash) | **Built** | `migrations/001_baseline.sql` triggers; `docs/APPEND_ONLY.md` |
| Append-only forensic receipts | **Built** | Same baseline; `forbid_receipt_*` functions |
| Evidence bundle export (JSON) with offline verify | **Built** | `services/aegis-api/src/forensic/evidence-bundle.ts`, `pnpm aegis-verify` |
| Approver / view binding on release (what they saw) | **Built** (Stage 5) | Console approvals + seal path; `docs/PROVENANCE.md` |
| Counterparty / regulator co-sign of witness roots | **Not built** | `docs/provenance/ASSURANCE_LADDER.md` |
| Physical / offline media custody workflow | **Not built** | — |

---

## 3. Time

| Element | Status | Evidence in code |
| --- | --- | --- |
| Server `emitted_at` / `ingested_at` on events | **Built** | `event` schema in `001_baseline.sql` |
| RFC 3161 TSA stamps on receipts / Merkle roots (when configured) | **Built** | `services/aegis-api/src/forensic/rfc3161.ts`, `docs/AEGIS_TSA_AND_KMS.md` |
| Local test HMAC TSA when `AEGIS_TSA_URL` unset | **Partial** | Dev/test only — not independent time |
| Clock-skew handling between bank core and Aegis | **Partial** | Capture both times; no formal skew policy engine |

---

## 4. Corroboration

| Element | Status | Evidence in code |
| --- | --- | --- |
| Value-hash match bank-app vs independently captured DB row (G3) | **Built** | `collector-match.ts`, `db_value_mismatch` / contradicted grade |
| Feed reconciliation / Exceptions (G2) | **Built** | Provenance docs + Exceptions UI |
| Multi-source same-fact agreement beyond configured collectors | **Partial** | Depends on registered channels reporting in |
| External auditor attestation of seal process | **Not built** | — |

---

## 5. Tamper detection

| Element | Status | Evidence in code |
| --- | --- | --- |
| Hash-chain / signature verify on bundles | **Built** | `aegis-verify`, public verify API, `test/bank-ready-pass2.test.ts` (tamper helper) |
| Append-only DB triggers block ordinary mutation | **Built** | `docs/APPEND_ONLY.md`, `tools/check-append-only-grants.sql` |
| Witness / Merkle checkpoints | **Built** | `aegis-witness`, `merkle_root` + TSA |
| Detect host compromise of evaluation host while keys available | **Not built** | No TEE; see ASSURANCE_LADDER |
| “Tamper-proof data” claim | **Not claimed** | Record is tamper-evident; source can still lie (`docs/DEMO.md`) |

---

## 6. Scenarios and sources

| Element | Status | Evidence in code |
| --- | --- | --- |
| Documented demo / provenance scenarios (A–G style stories, G3) | **Partial** | Simulator + provenance docs; realistic A–G governance stories are the current build target |
| Named sources / connectors with keys | **Built** | Demo Bank connectors, source envelopes |
| Incident objects for console follow-up | **Partial** | `routes/console/incidents.ts`, `repo/incidents.ts` — not a full IR playbook library |
| Formal “scenario catalog” tied to retention classes | **Not built** | — |

---

## 7. Retention and legal hold

See **§ Inventory** below. Summary:

| Element | Status |
| --- | --- |
| Per-tenant retention period (plan / override) | **Built** |
| Soft purge (redact payload, set `purged_at`) | **Built** |
| Org-wide legal hold freezes purge | **Built** |
| Per-event legal hold | **Built** |
| Artifact delete by `retention_until` (respects hold / WORM) | **Built** |
| Hard delete of sealed event rows on schedule | **Not built** (identity retained; payload redacted) |
| Litigation hold UI / counsel workflow / hold audit export | **Partial** (API toggle + console note only) |
| Customer-configurable deletion rules beyond plan days | **Partial** (`plan_overrides.retention_days` only) |

---

## 8. Playbooks

| Element | Status | Evidence in code |
| --- | --- | --- |
| Demo / ops runbooks (human) | **Built** (docs) | `docs/DEMO_RUNBOOK.md`, `docs/DEPLOY_PRODUCTION.md`, provenance closeout |
| In-product automated IR playbooks (step engines, RACI) | **Not built** | Incidents API is list/detail, not playbook execution |
| Red-team checklist as executable suite | **Partial** | Provenance red-team scripts; separate Red Team tenant required for demo hygiene |

---

## Inventory: retention and legal hold (today)

### What exists

| Feature | Behaviour | Code |
| --- | --- | --- |
| **Plan `retention_days`** | Default from `plan_catalog.retention_days` (baseline default **90**) | `001_baseline.sql`, `plan_catalog` |
| **Org override** | `organization.plan_overrides->>'retention_days'` | `organization.ts`, `retention-purge.ts` |
| **Org `legal_hold`** | When true, housekeeping **skips all purge** for that org | `purgeExpiredForOrganization` → `skipped_legal_hold: true` |
| **Event `legal_hold`** | Event payload not redacted; artifacts tied to held events not deleted | `UPDATE event SET legal_hold`; purge `WHERE legal_hold = false` |
| **Console / API toggle** | `POST` org legal hold; per-event legal hold | `routes/console/organization.ts` |
| **Purge effect on events** | Soft: `payload` / `args_redacted` → `NULL`, `purged_at = now()`; hash-chain identity remains | `retention-purge.ts` |
| **Purge effect on artifacts** | Hard `DELETE` when `retention_until < now()`, not `worm_locked`, event not on hold | same |
| **Housekeeping entry** | `maintenance/housekeeping.ts` calls retention purge | — |
| **Append-only vs purge** | Triggers allow payload redaction path documented in baseline comments; identity/hash immutable | `001_baseline.sql`, `APPEND_ONLY.md` |
| **Tenant wipe** | Separate demo/test-only `platform_wipe_tenant()` — not retention | `APPEND_ONLY.md`, `DEPLOY_PRODUCTION.md` §10.1 |

### Gaps (do not build yet)

1. No hard deletion of sealed event **rows** after retention — only payload redaction.
2. No per-event-type / per-scenario retention classes (one org-level day count).
3. No counsel / case-linked legal-hold packages, hold reason, or hold expiry.
4. No dedicated legal-hold audit export distinct from generic console audit actions.
5. No customer UI to edit `retention_days` beyond plan/override plumbing already readable in Settings.
6. No immutable WORM object-store lock integrated with cloud provider retention (artifact `worm_locked` flag exists; full cloud WORM path not productized here).
7. No playbook that ties “open incident → place legal hold → export bundle → notify counsel”.
8. No cross-tenant / regulator retention schedule catalog.

---

## Bottom line

Aegis today is strong on **capture, append-only custody, verify/tamper-evidence, optional TSA time, and soft retention with org/event legal hold**. It is weak on **formal IR playbooks, multi-party witness co-sign, TEE, and rich retention/hold workflows**. Retention/legal-hold **gaps are documented only** — implementation is out of scope for this pass.
