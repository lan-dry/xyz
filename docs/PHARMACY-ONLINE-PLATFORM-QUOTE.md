# Quotation

## Online pharmacy ordering and fulfilment platform

| Field | Value |
|-------|--------|
| Quotation ID | SAL-PHARM-QT-001 |
| Date | 17 September 2026 |
| Valid until | 17 October 2026 |
| Prepared by | Salanor Ltd, Kigali, Rwanda |
| Scope reference | [PHARMACY-ONLINE-PLATFORM-SRS.md](./PHARMACY-ONLINE-PLATFORM-SRS.md) (SAL-PHARM-SRS-001 v2.0) |
| Currency | Rwandan Francs (RWF), exclusive of any applicable taxes |

---

## 1. Summary

This quote covers **design, build, integration, testing support, and initial go-live** for the platform described in SAL-PHARM-SRS-001. That document is the **functional baseline**: what we build matches the SRS unless you request a written change order.

**Total fixed price (full SRS scope): 5,400,000 RWF**

Estimated calendar duration: **16 to 22 weeks** from contract signing and receipt of deposit, assuming workshop items in SRS section 24 are resolved within the first three weeks and the pharmacy’s PMS vendor provides integration access within a reasonable time.

This is **not** a brochure site or a WhatsApp-only ordering form. It is a regulated retail channel with prescription review, PMS alignment, and insurance-ready checkout.

---

## 2. What is included

| Deliverable | Maps to SRS |
|-------------|-------------|
| Public pharmacy site (legal disclosures, catalog, search, EN/FR UI) | Sections 4, 5, 6 |
| Patient accounts, addresses, consent and privacy flows | Sections 6, 4.3 |
| Cart and checkout (OTC and Rx rules, branch selection) | Section 7 |
| Prescription upload, pharmacist review queue, checklist, rejection codes | Sections 8, 9, Appendices A and C |
| Order lifecycle and staff console (roles per section 5) | Sections 9, 10 |
| Pickup codes and delivery workflow (zones configured with you) | Section 11 |
| Payments: mobile money and pay-at-pickup/co-pay flows as agreed in workshop | Section 12 |
| Insurance context (RSSB and other schemes as data you provide; formulary warnings) | Section 13 |
| PMS integration: catalog sync, reservation, sale reconciliation (one PMS product) | Section 14 |
| Notifications (SMS and/or email; WhatsApp if provider account is yours) | Section 15 |
| Returns, cancellations, complaints | Section 16 |
| Reporting and exports (Rx log, register export, insurance pending, audit) | Section 17 |
| Multi-branch data model (one branch live; second branch config if same PMS) | Section 18 |
| Security and operational behaviour per NFRs | Section 19 |
| UAT support against acceptance criteria (section 22) | Section 22 |
| Production deployment, SSL, backup configuration | NFR-09 |
| Two on-site or video training sessions for pharmacist and counter staff | |
| 30 days post go-live defect fix period (bugs against SRS, not new features) | |

---

## 3. What is not included

| Item | Notes |
|------|--------|
| Rwanda FDA online pharmacy authorization fees and legal advice | Pharmacy responsibility |
| PMS license fees, RSSB contracts, payment aggregator merchant fees | Pharmacy contracts |
| SMS, WhatsApp, maps, or payment gateway transaction charges | Billed by providers to pharmacy |
| Ongoing hosting and support after the defect-fix period | See section 7 (optional retainer) |
| Native iOS/Android apps | Out of scope in SRS; can be quoted separately |
| Second PMS integration or major PMS change mid-project | Change order |
| Content writing beyond structure (long-form medical copy, full Kinyarwanda translation) | Client or separate copy quote |
| Hardware (tablets for delivery, printers) | Client |

If the chosen PMS has **no API** and only manual export/import is possible, we will agree a **reduced integration scope** in writing during week 1. That may **lower** price (manual sync SOP) or **require a change order** if the pharmacy insists on real-time sync without vendor cooperation.

---

## 4. Price breakdown (full scope)

Transparent allocation for your records. Invoicing follows section 5, not line-by-line.

| Component | RWF |
|-----------|-----|
| Discovery, information architecture, UI for patient and staff | 900,000 |
| Catalog, search, stock-aware behaviour (PMS-driven) | 650,000 |
| Accounts, cart, checkout, order state machine | 850,000 |
| Prescription intake, pharmacist workflow, audit trail | 1,350,000 |
| PMS integration (single vendor, bidirectional as per SRS 14) | 950,000 |
| Insurance and co-pay flows, reporting | 650,000 |
| Delivery, notifications, returns and complaints | 450,000 |
| UAT, deployment, training, 30-day defect period | 600,000 |
| **Total** | **5,400,000** |

---

## 5. Payment schedule (recommended)

Fixed-price work for a small business is often paid in **milestones**, not 100% upfront. A **deposit plus balance at acceptance plus short installments after go-live** is normal in Rwanda and internationally, provided it is **in a signed agreement with clear dates and deliverables**.

Proposed schedule for **5,400,000 RWF**:

| Milestone | % | Amount (RWF) | Trigger |
|-----------|---|--------------|---------|
| 1. Project start | 30% | 1,620,000 | Signed agreement and invoice; deposit received before development starts |
| 2. UAT acceptance | 30% | 1,620,000 | Staging environment passes SRS section 22 UAT with your responsible pharmacist (or delegated tester) |
| 3. Go-live | 15% | 810,000 | Production launch and handover of admin access |
| 4. Installment 1 | 8.33% | 450,000 | Due 30 days after go-live |
| 5. Installment 2 | 8.33% | 450,000 | Due 60 days after go-live |
| 6. Installment 3 | 8.34% | 450,000 | Due 90 days after go-live |

**Total** | **100%** | **5,400,000** |

Notes:

- Installments are **interest-free**; they are a cash-flow convenience, not a loan product.
- If you prefer **no installments**, milestones 1 to 3 can be **40% / 40% / 20%** with the final 20% at go-live.
- Late payment: work pauses, hosting and support suspend after **15 calendar days** past due date until account is current (standard B2B clause).
- **Intellectual property and production credentials**: full transfer of custom code and deployment documentation upon **receipt of final payment**, unless we agree earlier transfer with a retained license clause for generic components. State this explicitly in the contract.

**Is this unprofessional?** No, if you present it as a **milestone payment schedule** on letterhead with invoices, not as an informal “pay me when you can.” What sounds unprofessional is vague amounts, no written scope, or building the entire system before any deposit. Do **not** accept 800,000 RWF for this scope; that figure is unrelated to this quote (see section 8).

---

## 6. Timeline (indicative)

| Phase | Weeks | Output |
|-------|-------|--------|
| Workshop and PMS access | 1 to 3 | Signed integration approach, configs |
| Patient site and OTC path | 4 to 8 | Staging: browse, cart, pay or pay-at-pickup |
| Rx and pharmacist console | 9 to 14 | Staging: full Rx scenarios |
| Insurance and reports | 15 to 17 | Staging: co-pay and exports |
| UAT and go-live | 18 to 22 | Production per section 22 |

Delays caused by missing PMS API, unpaid third-party accounts, or FDA authorization not in place **extend the timeline** without automatic price reduction.

---

## 7. Optional ongoing services (after go-live)

| Service | Monthly (RWF) | Includes |
|---------|---------------|----------|
| **Care plan** | 320,000 | Managed hosting, TLS, backups, monitoring, up to 4 hours minor fixes or config |
| **Care plus** | 480,000 | Above plus priority response, monthly sync health review, security patches |

Not mandatory to sign on day one, but **production systems handling health data should not run without maintenance**. Quote hosting separately if you host elsewhere.

---

## 8. Alternative if budget is constrained (not full SRS)

If **5,400,000 RWF** is not feasible, do **not** pretend the full SRS is included. Offer a **written phase** instead:

| Option | Scope (summary) | Price (RWF) | Duration |
|--------|-----------------|-------------|----------|
| **Phase 0** | Professional site, OTC catalog (manual or simple stock), order request (form/WhatsApp handoff), legal pages | 950,000 | 4 to 6 weeks |
| **Phase 1** | Phase 0 plus patient accounts, cart, MoMo or pay-at-pickup, staff order list (no full Rx engine) | 2,450,000 cumulative | +8 to 10 weeks |
| **Phase 2** | Full Rx workflow and pharmacist console (SRS sections 8 to 9) | +1,850,000 | +6 to 8 weeks |
| **Phase 3** | PMS integration plus insurance plus delivery plus reporting (remainder of SRS) | +1,100,000 | +6 to 8 weeks |

**Phase 0 to 3 total** aligns with full SRS (~5,400,000) but lets her **stop after any phase** with a working product.

Her **800,000 RWF** expectation matches **roughly Phase 0 minus** (brochure plus catalog only, no proper checkout). You can counter with **950,000 RWF for Phase 0** as the floor for something you can stand behind, or decline if she insists on “full platform” at that price.

---

## 9. Realistic view for both sides

**For the pharmacy**

- They gain a sales channel that respects GDP/GPP and FDA online rules, tied to stock and receipts they already need for RRA and RSSB.
- They must still fund PMS, authorization, and payment merchant costs.
- They must assign a **responsible pharmacist** for UAT and ongoing Rx decisions; software does not remove liability.

**For Salanor (you)**

- 5.4M RWF over ~5 months is **~1.08M per month** gross before tax, tools, and any subcontract (PMS specialist, designer). That is fair for one senior lead plus part-time help, not a large agency bench.
- PMS integration risk is the main unknown: **price assumes one cooperative integration**; document that in the contract.
- Do not start work without deposit; do not go-live without UAT sign-off and at least go-live milestone paid.

**Negotiation**

- You may reduce price **only** by **reducing scope** (phases, manual PMS sync, insurance deferred to Phase 3), not by keeping SRS and cutting price.
- Installments after go-live are a **sales tool** for a serious client with cash-flow timing issues, not for a client who cannot afford the project.

---

## 10. Acceptance

To proceed:

1. Confirm acceptance of SAL-PHARM-SRS-001 v2.0 as functional scope (or list written exceptions).
2. Complete workshop items in SRS section 24 within three weeks of signing.
3. Sign the service agreement [PHARMACY-ONLINE-PLATFORM-SOW.md](./PHARMACY-ONLINE-PLATFORM-SOW.md) (SAL-PHARM-SOW-001), which incorporates this quotation and the SRS.
4. Pay milestone 1.

**Client name:** _______________________________

**Signature / date:** _______________________________

**Salanor Ltd**

**Authorized signatory:** _______________________________

**Date:** _______________________________

---

*This quotation is an offer to contract. It is not legal or tax advice. VAT or withholding, if applicable, will be shown on invoices per Rwanda law.*
