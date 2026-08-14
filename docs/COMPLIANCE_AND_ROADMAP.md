# Compliance & platform roadmap

Single reference for **what is live**, **what we build in product**, **what needs auditors/regulators**, and **how to start SOC 2**.

Companion docs: [`BILLING_AND_PLANS.md`](BILLING_AND_PLANS.md) (pricing & invoicing), [`PRODUCTION_READY.md`](PRODUCTION_READY.md) (go-live tiers), public [`/trust`](https://www.salanor.com/trust).

---

## Table of contents

1. [Legend](#legend)
2. [Live today](#live-today-design-partner-ready)
3. [In product (engineering)](#in-product-we-can-build-or-improve)
4. [External programs](#external-programs-cannot-implement-in-code)
5. [Suggested order of operations](#suggested-order-of-operations)
6. [What we tell prospects](#what-we-tell-prospects)
7. [SOC 2 readiness](#soc-2-readiness-salanor-ltd--aegis)

---

## Legend

| Label | Meaning |
|-------|---------|
| **Live** | Shipped and usable in production |
| **In product** | Engineering can build or improve in the repo |
| **External** | Requires third party (auditor, Stripe, agency sponsor) — not a code toggle |
| **Target** | Planned date; not a commitment to customers until done |

---

## Live today (design-partner ready)

- APS-1 signed events, policy engine, human approvals
- n8n Workflow Bridge + governed demo workflows
- Trace replay, verify chain, Merkle witness batches
- Compliance export ZIPs (SOC 2 / EU AI Act **mapping**, not certification)
- OTel SIEM forwarding (Datadog, Splunk, Sentinel)
- Platform Ops: org provisioning, plan limits, **manual invoice billing**
- Marketing: `/pricing`, `/trust`, `/leave-behind`, product pages
- Sign-in history with IP + cloud/VPN-aware location label

---

## In product (we can build or improve)

| Item | Status | Notes |
|------|--------|-------|
| Approval / trace lifecycle polish | Done | Pending approvals close when trace fails/completes |
| Sign-in geo (cloud/VPN detection) | Done | Avoid misleading datacenter cities |
| Export control mapping expansion | Ongoing | More CC* controls in `control-mapping-soc2.json` |
| Retention purge automation | Roadmap | Display retention today; automated purge TBD |
| SSO / SAML (Enterprise) | Roadmap | Identity service extension |
| GCP BYOK GA | Pilot | GCP KMS token path exists |
| Insurance / Aether product | Preview | Sidebar preview only |
| Stripe self-serve checkout UI | Blocked | Salanor entity country — use invoice billing |

---

## External programs (cannot “implement” in code)

### SOC 2 Type I → Type II

| Phase | What it is | Owner | Target |
|-------|------------|-------|--------|
| Readiness | Policies, access reviews, evidence collection | Salanor + CPA / readiness platform | Now |
| Type I | Point-in-time control design assessment | Licensed CPA / IT auditor | H2 2026 |
| Type II | Operating effectiveness over 3–12 months | CPA / IT auditor | Q4 2026 |

**Product support today:** compliance exports, audit log, signed events, approval records, witness proofs. See [SOC 2 readiness](#soc-2-readiness-salanor-ltd--aegis) below.

**Readiness platforms (optional, paid):** Vanta, Drata, Secureframe — help *you* collect evidence; they are **not** competitors to Aegis and do **not** issue the certificate.

### FedRAMP Moderate

| Phase | What it is | Owner | Target |
|-------|------------|-------|--------|
| Control mapping | SSP-aligned architecture docs | Salanor | Live (`/legal/fedramp`) |
| SOC 2 Type II | Prerequisite for most agencies | CPA | Before FedRAMP |
| SSP + 3PAO | Independent assessment | 3PAO | 2027 |
| Authorization | Agency sponsor or JAB | US government | Q2 2027 target |

**Do not claim FedRAMP authorized until complete.**

### Stripe self-serve billing

Stripe requires Salanor Ltd in a [Stripe-supported country](https://stripe.com/global).

- **Use now:** Platform Ops → Record pending invoice → Mark paid
- **Details:** [`BILLING_AND_PLANS.md`](BILLING_AND_PLANS.md) § Non-Stripe regions

### EU AI Act / HIPAA / NIST AI RMF

- Mapping themes in export bundles (not legal certification)
- Formal attestation: customer legal / DPO review

---

## Suggested order of operations

1. **Design partners** — demo, leave-behind PDF, manual invoicing
2. **SOC 2 readiness** — CPA scoping and/or Vanta/Drata trial (section below)
3. **Type I audit** — when policies + ~30 days evidence exist
4. **Stripe** — when entity in supported jurisdiction, or stay invoice-only
5. **Type II observation** — parallel with revenue
6. **FedRAMP** — after Type II + US public-sector design partner

---

## What we tell prospects

| They ask | Honest answer |
|----------|---------------|
| Are you SOC 2 certified? | No. Export mapping + Type I **readiness** report in bundle; audit target Q4 2026. |
| FedRAMP? | Architecture path documented; not authorized. Target Q2 2027. |
| Can I pay by card? | If Stripe enabled, yes. Otherwise invoice via sales. |
| Is sign-in location exact? | No. Cloud/VPN IPs show “Cloud or VPN”, not your city. |

Keep `/trust` and sales deck aligned with this table.

---

## SOC 2 readiness (Salanor Ltd / Aegis)

**Status:** Salanor is **not** SOC 2 certified. This section is a pre-audit checklist mapped to Aegis exports. It does not replace a licensed auditor.

### Evidence Aegis already produces

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

Controls in `services/aegis-api/src/compliance/control-mapping.ts`:

| ID | Name | Pass when |
|----|------|-----------|
| CC6.1 | Logical access — agent actions logged | Events + active policies in period |
| CC6.6 | Human approval for obligations | Approvals recorded for obligation events |
| CC7.2 | Monitoring — witness + inclusion proofs | Witness roots and proofs present |
| CC8.1 | Change management — console audited | Audit log entries in period |

Run a **monthly export** during Type II observation.

### Phase 0 — Pick your path

| Option | Best for | Cost (typical) |
|--------|----------|----------------|
| **CPA you trust** | Local relationship, scoping call | Audit fee (varies) |
| **Vanta / Drata / Secureframe** | Policy templates + automated evidence | ~$15k–50k/yr |
| **DIY + Aegis exports** | Pre-revenue, design partners only | Your time |

You can use **both**: a CPA for the audit and Vanta/Drata to organize evidence (optional).

### Phase 1 — Policies & ownership (weeks 1–4)

| Policy | Owner | Aegis tie-in |
|--------|-------|--------------|
| Information security policy | CEO / CTO | `/legal/security` whitepaper as draft |
| Access control policy | CTO | Console RBAC, API keys, org isolation |
| Change management | Engineering | Git + Platform Ops audit log |
| Incident response | CTO | Trace replay, export bundles |
| Vendor management | Ops | Railway, Vercel, Neon, Resend inventory |
| Data retention | Product | Plan retention days |

**Checklist:** security owner named · employee access list · onboarding/offboarding · annual policy review date

### Phase 2 — Technical controls (weeks 2–8)

| Control area | Salanor today | Gap to close |
|--------------|---------------|--------------|
| Authentication | Email/password, scrypt | MFA for admins (roadmap) |
| Authorization | Org-scoped RBAC | Document role matrix |
| Logging | Signed events + audit log | SIEM for prod ops |
| Encryption | TLS + provider at-rest | Document + vendor SOC 2 PDFs |
| Backups | Neon PITR | Document RPO/RTO |
| Vulnerability mgmt | Dependabot | Triage SLA for critical |

**Product checklist:** witness worker · housekeeping cron · compliance worker + export volume · monthly scheduled export · one export with pass or documented partials

### Phase 3 — Evidence collection (30–90 days before Type I)

| Evidence | Source | Frequency |
|----------|--------|-----------|
| Compliance export ZIP | Console → Exports | Monthly |
| Access review | Platform Ops → team | Quarterly |
| Key rotation | Console → API keys | On change + quarterly |
| Vendor SOC 2 reports | Railway, Vercel, Neon | Annual |

### Phase 4 — Type I · Phase 5 — Type II

- **Type I:** design of controls at a point in time; walk auditor through trace → approval → witness → export ZIP
- **Type II:** 3–12 months operating effectiveness; monthly exports + quarterly access reviews

### Vanta/Drata → Aegis mapping (if you use a platform)

| Platform theme | Primary Aegis evidence |
|----------------|------------------------|
| Access | `audit-log.ndjson` |
| Logging & monitoring | `events.ndjson`, SIEM config |
| Change management | Git + `audit-log.ndjson` |
| Risk assessment | `control-mapping-soc2.json` |

### Customer-facing language

| Say | Do not say |
|-----|------------|
| “SOC 2 control mapping in exports” | “We are SOC 2 certified” |
| “Type I readiness report in bundle” | “Audit-ready certification” |
| “Target Q4 2026 Type II” | “SOC 2 compliant today” |

### Next actions

1. [ ] Talk to your CPA contact — scoping call + show export ZIP
2. [ ] Optional: Vanta or Drata trial
3. [ ] Enable monthly scheduled export on Salanor org
4. [ ] Confirm witness + housekeeping workers in prod
5. [ ] Document vendor list
