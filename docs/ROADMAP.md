# Salanor platform roadmap

Honest view of what is **live today**, what we can **prepare in product**, and what requires **external programs** (auditors, regulators, payment providers).

Use with `/trust` on marketing and `docs/PRODUCTION_READY.md` for go-live decisions.

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

## In product (we can implement or improve)

These strengthen the platform without claiming certifications we do not hold.

| Item | Status | Notes |
|------|--------|-------|
| Approval / trace lifecycle polish | Done | Pending approvals close when trace fails/completes |
| Sign-in geo (cloud/VPN detection) | Done | Avoid misleading datacenter cities |
| Export control mapping expansion | Ongoing | More CC* controls in `control-mapping-soc2.json` |
| Retention purge automation | Roadmap | Display retention today; automated purge TBD |
| SSO / SAML (Enterprise) | Roadmap | Identity service extension |
| GCP BYOK GA | Pilot | GCP KMS token path exists |
| Insurance / Aether product | Preview | Sidebar preview only |
| Stripe self-serve checkout UI | Blocked | See **External** — Salanor entity country |

---

## External programs (cannot “implement” in code)

### SOC 2 Type I → Type II

| Phase | What it is | Owner | Target |
|-------|------------|-------|--------|
| Readiness | Policies, access reviews, evidence collection | Salanor + auditor platform | Now |
| Type I | Point-in-time control design assessment | CPA / 3rd party | H2 2026 |
| Type II | Operating effectiveness over 3–12 months | CPA / 3rd party | Q4 2026 |

**Product support today:** compliance exports, audit log, signed events, approval records, witness proofs.

**See:** `docs/SOC2_READINESS.md`

### FedRAMP Moderate

| Phase | What it is | Owner | Target |
|-------|------------|-------|--------|
| Control mapping | SSP-aligned architecture docs | Salanor | Live (`/legal/fedramp`) |
| SOC 2 Type II | Prerequisite for most agencies | CPA | Before FedRAMP |
| SSP + 3PAO | Independent assessment | 3PAO | 2027 |
| Authorization | Agency sponsor or JAB | US government | Q2 2027 target |

**Do not claim FedRAMP authorized until complete.**

### Stripe self-serve billing

Stripe requires Salanor Ltd to be registered in a [Stripe-supported country](https://stripe.com/global). If not supported:

- **Use now:** Platform Ops → Record pending invoice → Mark paid (Team / Enterprise)
- **Customer flow:** Console → Billing → Contact sales; ops activates plan after payment

**See:** `docs/BILLING_AND_PLANS.md` § Non-Stripe regions

### EU AI Act / HIPAA / NIST AI RMF

- **Mapping in exports:** partial themes in bundles (not legal certification)
- **Formal attestation:** customer legal / DPO review of export evidence

---

## Suggested order of operations

1. **Design partners** — demo, leave-behind PDF, manual invoicing
2. **SOC 2 readiness** — Vanta/Drata or CPA scoping (`SOC2_READINESS.md`)
3. **Type I audit** — when policies + 30 days evidence exist
4. **Stripe** — when entity moves to supported jurisdiction OR use invoice-only GTM
5. **Type II observation** — parallel with revenue
6. **FedRAMP** — after Type II + public-sector design partner

---

## What we tell prospects

| They ask | Honest answer |
|----------|---------------|
| Are you SOC 2 certified? | No. We ship export mapping and a Type I **readiness** report; audit target Q4 2026. |
| FedRAMP? | Architecture path documented; not authorized. Target Q2 2027. |
| Can I pay by card? | If Stripe enabled for your org, yes. Otherwise invoice via sales. |
| Is sign-in location exact? | No. Cloud/VPN IPs show “Cloud or VPN”, not your city. |

Keep `/trust` and sales deck aligned with this table.
