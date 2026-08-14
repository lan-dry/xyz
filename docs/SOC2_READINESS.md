# SOC 2 readiness (Salanor Ltd / Aegis)

This is a **pre-audit checklist** mapped to what Aegis already produces. It does **not** replace an auditor or readiness platform (Vanta, Drata, Secureframe, etc.).

**Status:** Salanor is **not** SOC 2 certified. Target: Type I in H2 2026, Type II Q4 2026.

---

## What Aegis already gives you (evidence artifacts)

Generate from Console → **Exports** (Team+ unlimited; Free 2/month).

| Artifact in ZIP | SOC 2 use |
|-----------------|-----------|
| `events.ndjson` | CC6.1 — agent actions logged with policy decision |
| `policies.json` | CC6.1 — logical access / policy rules |
| `approvals.ndjson` | CC6.6 — human approval for high-risk actions |
| `audit-log.ndjson` | CC8.1 — console change management |
| `witness-roots.json` + `inclusion-proofs.ndjson` | CC7.2 — tamper-evident monitoring |
| `control-mapping-soc2.json` | Automated pass/partial/fail per control |
| `soc2-type1-report.json` | Executive readiness summary + recommendations |
| `manifest.json` + ZIP SHA-256 | Integrity verification |

Controls assessed in code today (`services/aegis-api/src/compliance/control-mapping.ts`):

| ID | Name | Pass when |
|----|------|-----------|
| CC6.1 | Logical access — agent actions logged | Events + active policies in period |
| CC6.6 | Human approval for obligations | Approvals recorded for obligation events |
| CC7.2 | Monitoring — witness + inclusion proofs | Witness roots and proofs present |
| CC8.1 | Change management — console audited | Audit log entries in period |

Run a **monthly export** during Type II observation so auditors have continuous evidence.

---

## Phase 0 — Pick your path (now)

| Option | Best for | Cost (typical) |
|--------|----------|----------------|
| **Vanta / Drata / Secureframe** | Faster policy templates + evidence collection | ~$15k–50k/yr |
| **CPA firm directly** | You already have a trusted auditor | Scoping call |
| **DIY + exports** | Design partners only, pre-revenue | Time cost |

**Recommendation:** Start Vanta or Drata trial; import Aegis export ZIPs as evidence for CC6/CC7/CC8.

---

## Phase 1 — Policies & ownership (weeks 1–4)

Auditors expect written policies even if product enforces controls technically.

| Policy | Owner | Aegis tie-in |
|--------|-------|--------------|
| Information security policy | CEO / CTO | `/legal/security` whitepaper as draft |
| Access control policy | CTO | Console RBAC, API keys, org isolation |
| Change management | Engineering | Git + Platform Ops audit log |
| Incident response | CTO | Trace replay, export bundles, approval deny path |
| Vendor management | Ops | Railway, Vercel, Neon, Resend inventory |
| Data retention | Product | Plan retention days; purge automation roadmap |

**Checklist**

- [ ] Named security owner (name + email in internal doc)
- [ ] Employee / contractor list with access levels
- [ ] Onboarding / offboarding checklist (revoke console access, rotate keys)
- [ ] Annual policy review date scheduled

---

## Phase 2 — Technical controls (weeks 2–8)

| Control area | Salanor today | Gap to close |
|--------------|---------------|--------------|
| Authentication | Email/password, scrypt, sessions | MFA for console admins (roadmap) |
| Authorization | Org-scoped RBAC | Document role matrix |
| Logging | Signed events + audit log | SIEM destination for prod ops |
| Encryption in transit | TLS everywhere | Document min TLS version |
| Encryption at rest | Neon / Railway provider | Confirm provider SOC 2 reports |
| Secrets | Env vars, no BYOK private keys stored | Secret rotation runbook |
| Backups | Neon PITR (verify plan) | Document RPO/RTO |
| Vulnerability mgmt | Dependabot (GitHub) | Triage SLA for critical |
| Uptime | Railway / Vercel status | External status page (roadmap) |

**Product checklist**

- [ ] Witness worker running in prod (`WITNESS_INTERVAL_MS`)
- [ ] Housekeeping cron running (approval expiry, stale traces)
- [ ] Compliance worker + `COMPLIANCE_EXPORT_DIR` volume
- [ ] Monthly scheduled export enabled on demo org
- [ ] At least one export with `overall_status: pass` or documented partials

---

## Phase 3 — Evidence collection (30–90 days before Type I)

Auditors sample **operating effectiveness**. Collect:

| Evidence | Source | Frequency |
|----------|--------|-----------|
| Compliance export ZIP | Console → Exports | Monthly |
| Access review | Platform Ops → team list | Quarterly |
| Key rotation | Console → API keys audit | On change + quarterly review |
| Incident tickets | Your tracker | As occurred |
| Pen test / vuln scan | External or GitHub | Annual |
| Vendor SOC 2 reports | Railway, Vercel, Neon | Annual refresh |

**Align export period** with audit window (e.g. last 90 days before Type I fieldwork).

---

## Phase 4 — Type I audit

- **Scope:** Trust Services Criteria — usually **Security** only for first pass; add Availability/Confidentiality if customers require.
- **Deliverable:** Type I report (design of controls at a point in time).
- **Use Aegis:** Attach sample export + walk through trace → approval → witness → verify.

---

## Phase 5 — Type II observation (3–12 months)

- Run controls continuously; no “audit theater” spikes.
- Monthly exports + quarterly access reviews.
- Type II report states controls operated effectively over the period.

---

## Mapping Vanta/Drata controls → Aegis exports

When configuring a readiness platform, map:

| Vanta/Drata theme | Primary Aegis evidence |
|-------------------|------------------------|
| Access | `audit-log.ndjson` (invites, role changes), API key metadata |
| Logging & monitoring | `events.ndjson`, OTel SIEM config screenshot |
| Change management | Git history + `audit-log.ndjson` (policy publish) |
| Risk assessment | `control-mapping-soc2.json` fail/partial items |
| Vendor management | Provider SOC 2 PDFs (not in ZIP — attach separately) |

Upload each monthly ZIP to the auditor’s evidence vault with period dates matching `manifest.json`.

---

## Recommendations engine (already in product)

`soc2-type1-report.json` includes automated recommendations when controls are partial/fail, e.g.:

- No events in period → run ingest before audit
- No witness roots → start witness worker
- No audit log → perform console actions in period

**Action:** Fix partials before scheduling Type I.

---

## Customer-facing language

| Say | Do not say |
|-----|------------|
| “SOC 2 control mapping in exports” | “We are SOC 2 certified” |
| “Type I readiness report in bundle” | “Audit-ready certification” |
| “Target Q4 2026 Type II” | “SOC 2 compliant today” |

Sync with `/trust` and `/legal/security`.

---

## Next actions for Salanor team

1. [ ] Sign up for Vanta or Drata trial
2. [ ] Upload latest compliance export from prod demo org
3. [ ] Fill policy gaps their template flags
4. [ ] Book CPA scoping call with export sample
5. [ ] Enable monthly scheduled export on Salanor org
6. [ ] Document vendor list (Railway, Vercel, Neon, Resend, n8n host)

See also: `docs/ROADMAP.md`, `docs/BILLING_AND_PLANS.md`, `docs/PRODUCTION_READY.md`.
