# SOFTWARE DEVELOPMENT AND DELIVERY AGREEMENT

## (Statement of Work)

| Field | Value |
|-------|--------|
| Agreement ID | SAL-PHARM-SOW-001 |
| Version | 1.0 |
| Date | __________________ 2026 |

---

This Software Development and Delivery Agreement (this **Agreement**) is entered into as of the date last signed below (the **Effective Date**).

**BETWEEN:**

1. **Salanor Ltd**, a company incorporated in the Republic of Rwanda, with registered address at _______________________________, Kigali, Rwanda, TIN _______________________________ (the **Developer**); and

2. **_______________________________________________**, a company / licensed business operating as a retail pharmacy in the Republic of Rwanda, with address at _______________________________, TIN _______________________________, Rwanda FDA retail authorization reference _______________________________ (the **Client**).

The Developer and the Client are each a **Party** and together the **Parties**.

---

## RECITALS

A. The Client wishes to operate an online ordering and fulfilment channel for medicines in compliance with applicable Rwanda law and Rwanda Food and Drugs Authority (Rwanda FDA) requirements.

B. The Developer has prepared a Software Requirements Specification document **SAL-PHARM-SRS-001** version **2.0** dated 17 September 2026 (the **SRS**), which describes the functional behaviour of the platform.

C. The Developer has issued quotation **SAL-PHARM-QT-001** dated 17 September 2026 (the **Quotation**), which sets the fixed price and payment schedule for delivery of the platform described in the SRS.

D. The Parties wish to contract on the terms below, with the SRS and Quotation incorporated as schedules.

**NOW, THEREFORE**, the Parties agree as follows:

---

## 1. Definitions

1.1 **Change Order** means a written document signed by both Parties describing a change to Scope, fees, or timeline.

1.2 **Confidential Information** means non-public business, technical, financial, or personal information disclosed by one Party to the other in connection with this Agreement, including prescription images, patient data processed on behalf of the Client, integration credentials, and pricing.

1.3 **Deliverables** means the custom software, configuration, documentation, and training described in Section 2 and Schedule B, conforming to the SRS except as modified by a Change Order.

1.4 **Go-Live** means first production release of the platform to the public or to authenticated patients, as directed by the Client in writing after UAT Acceptance.

1.5 **PMS** means the Client’s pharmacy management system used in-store for stock, point of sale, Rwanda Revenue Authority fiscal receipts, and insurance billing.

1.6 **Scope** means implementation of the SRS as the functional baseline, subject to Section 3 and Schedule A.

1.7 **UAT** means user acceptance testing against the criteria in SRS Section 22.

1.8 **UAT Acceptance** means the Client’s written sign-off that UAT on the staging environment has passed, signed by the Client’s responsible pharmacist or a person the Client designates in writing with authority to accept on behalf of the pharmacy.

1.9 **Workshop Items** means the open configuration items listed in SRS Section 24 and Schedule C.

---

## 2. Services and deliverables

2.1 **Engagement.** The Developer shall design, develop, integrate, test, deploy, and support initial go-live of the **online pharmacy ordering and fulfilment platform** (the **Platform**) in accordance with the SRS and this Agreement.

2.2 **Included deliverables.** Without limiting the SRS, the Developer shall provide:

(a) public pharmacy website and authenticated patient area (mobile web as minimum);

(b) staff console for roles defined in SRS Section 5;

(c) catalog, cart, checkout, order lifecycle, prescription intake and pharmacist review workflow;

(d) pickup and delivery workflows as configured under Workshop Items;

(e) payment flows (mobile money and pay-at-pickup / co-pay) as agreed in Workshop Items;

(f) insurance context and reporting as described in SRS Sections 13 and 17, based on data and contracts supplied by the Client;

(g) integration with **one** PMS product nominated by the Client during the workshop period, per SRS Section 14;

(h) notifications, returns, cancellations, and complaints per SRS Sections 15 and 16;

(i) reporting and exports per SRS Section 17;

(j) deployment to production with TLS, backup configuration as described in SRS NFR-09;

(k) two (2) training sessions (on-site or video) for pharmacist and counter staff;

(l) support during a **Defect Fix Period** of thirty (30) calendar days following Go-Live, limited to correction of defects where the Platform does not conform to the SRS (not new features).

2.3 **Excluded services.** The following are **not** included unless added by Change Order or a separate signed agreement:

(a) Rwanda FDA online pharmacy authorization applications, fees, or legal advice;

(b) PMS license fees, RSSB or other insurer contracts, payment aggregator merchant setup and fees;

(c) charges from SMS, WhatsApp, email, maps, or payment providers;

(d) native iOS or Android applications;

(e) a second PMS integration or replacement of PMS mid-project;

(f) ongoing hosting and support after the Defect Fix Period (optional Care Plan in Schedule D);

(g) hardware, long-form medical copywriting, or full Kinyarwanda translation unless separately agreed;

(h) telemedicine, prescribing, or EMR integration beyond reserved interfaces in the SRS.

2.4 **PMS integration contingency.** If the nominated PMS vendor provides no reasonable API or cooperation within sixty (60) days of the Client’s written nomination, the Parties shall meet within ten (10) business days to agree in writing either: (i) a manual sync standard operating procedure with adjusted timeline and, if applicable, fee adjustment; or (ii) a Change Order for additional effort; or (iii) termination of this Agreement under Section 12.3 without penalty to either Party except payment for work performed through the termination date.

2.5 **Subcontractors.** The Developer may use subcontractors who are bound by confidentiality and data protection obligations no less protective than this Agreement. The Developer remains responsible for their performance.

---

## 3. Scope control and change orders

3.1 **SRS as baseline.** The SRS version identified in Schedule A is the functional baseline. The Platform shall be accepted or rejected against the SRS and Section 8.

3.2 **Workshop Items.** Configuration covered by Workshop Items (Schedule C) shall be supplied by the Client. Failure to supply Workshop Items within agreed dates extends the timeline day-for-day and does not reduce the fixed fee.

3.3 **Changes.** Any request to add, remove, or alter behaviour beyond the SRS requires a Change Order stating scope, fee, and schedule impact. The Developer is not obliged to begin changed work until the Change Order is signed.

3.4 **Written exceptions.** If the Client requires exceptions to the SRS, they must be listed in **Schedule A, Part 2** before signing. If Schedule A Part 2 is blank, no exceptions apply.

---

## 4. Client obligations

4.1 **Regulatory.** The Client shall maintain valid retail pharmacy licensing, obtain and maintain any Rwanda FDA authorization required for online pharmacy practice before public Rx sales, and operate the Platform in compliance with Law No. 12/99, Rwanda FDA regulations, RRA rules, and insurer agreements.

4.2 **Responsible pharmacist.** The Client shall designate a licensed responsible pharmacist for Rx approvals in production and for UAT sign-off (or delegate in writing).

4.3 **Cooperation.** The Client shall timely provide: branding assets, license numbers, privacy policy and terms content (Developer may supply templates), formulary and insurer data, PMS access and vendor liaison, payment merchant accounts, notification provider accounts, delivery zones, and staff testers.

4.4 **Accuracy.** The Client is solely responsible for clinical dispensing decisions, insurance eligibility, and fiscal reporting in the PMS. The Platform supports workflows; it does not replace professional judgment.

4.5 **Third parties.** The Client shall contract directly with PMS, payment, SMS, and insurer providers and pay their fees.

---

## 5. Fees and payment

5.1 **Fixed fee.** The total fixed fee for Scope in this Agreement is **Five Million Four Hundred Thousand Rwandan Francs (RWF 5,400,000)**, exclusive of applicable taxes unless stated on invoices.

5.2 **Payment schedule.** The Client shall pay according to Schedule B. Amounts are due within **seven (7) calendar days** of invoice date unless another date is stated on the invoice.

5.3 **Deposit.** The Developer shall not commence development until Milestone 1 in Schedule B is received in cleared funds.

5.4 **Late payment.** If any amount is more than **fifteen (15) calendar days** overdue, the Developer may suspend work, withhold Go-Live, and suspend hosting or support until all overdue amounts and reasonable reactivation costs are paid. Time suspended extends delivery dates.

5.5 **Taxes.** The Client shall pay VAT or other taxes if applicable, as shown on valid tax invoices issued by the Developer in compliance with Rwanda law.

5.6 **Expenses.** Unless a Change Order provides otherwise, travel outside Kigali city for training requested by the Client is reimbursed at cost with prior written approval.

5.7 **No set-off.** The Client may not withhold payment for disputed items without giving written notice of the specific SRS requirement alleged to fail; the Parties shall use Section 8.3 for disputes during UAT.

---

## 6. Timeline

6.1 **Estimated duration.** Estimated calendar duration is **sixteen (16) to twenty-two (22) weeks** from Effective Date and receipt of Milestone 1, subject to Client timely performance and PMS integration per Section 2.4.

6.2 **Indicative phases.** Schedule B includes an indicative phase plan. Dates are estimates, not guarantees, except that the Developer shall use commercially reasonable efforts to meet milestones agreed in writing after the workshop.

6.3 **Delay.** Developer delay caused solely by the Developer’s fault and exceeding thirty (30) days beyond the estimated Go-Live window, where the Client has met all obligations, shall be remedied by good-faith schedule revision. Unless gross negligence applies, the Developer’s liability for delay is limited to Section 11.

---

## 7. Intellectual property and licenses

7.1 **Client materials.** The Client retains all rights in its trademarks, content, formulary data, and pre-existing materials supplied to the Developer.

7.2 **Custom deliverables.** Upon receipt of **full payment** of all fees under Schedule B, the Developer assigns to the Client all right, title, and interest in the **custom** software and documentation created specifically for the Client under this Agreement (the **Custom Code**), excluding Developer Pre-existing Materials.

7.3 **Developer pre-existing materials.** The Developer retains ownership of frameworks, libraries, tools, and generic components used across clients (**Developer Pre-existing Materials**). The Developer grants the Client a perpetual, non-exclusive, royalty-free license to use Developer Pre-existing Materials solely as embedded in or necessary to operate the Custom Code.

7.4 **Prior to full payment.** Until full payment, the Client receives a limited license to use staging and production environments for UAT and Go-Live. The Developer may withhold repository access, deployment credentials, and final documentation until full payment.

7.5 **Open source.** The Developer shall disclose material open-source components in documentation. Open-source licenses govern those components.

7.6 **Portfolio.** The Client grants the Developer permission to list the Client’s trade name and non-clinical screenshots in the Developer’s portfolio after Go-Live, unless the Client opts out in writing on signing.

---

## 8. Acceptance and UAT

8.1 **Staging.** The Developer shall provide a staging environment for UAT.

8.2 **UAT criteria.** UAT shall follow SRS Section 22, including at minimum: ten (10) scripted Rx scenarios, five (5) OTC scenarios, and if insurance is enabled, three (3) RSSB co-pay reconciliation scenarios, plus published privacy policy and load test criteria as stated in the SRS.

8.3 **Process.** The Client shall complete UAT within **twenty (20) business days** of written notice that staging is ready. The Client shall report defects with steps to reproduce. The Developer shall fix SRS defects within commercially reasonable time. UAT Acceptance is the Client’s written confirmation that criteria are met or that only non-blocking defects remain with a written waiver.

8.4 **Deemed acceptance.** If the Client uses the staging environment for live patient orders without written objection, or fails to complete UAT within twenty (20) business days without good cause, the Developer may issue a written notice; if the Client does not respond within ten (10) business days, UAT Acceptance may be deemed for Milestone 2 purposes, without limiting the Client’s Defect Fix Period rights.

8.5 **Go-Live.** Go-Live requires UAT Acceptance and payment of Milestones 1 and 2 and Milestone 3 as stated in Schedule B (Go-Live milestone may be invoiced on Go-Live date).

---

## 9. Confidentiality and personal data

9.1 **Confidentiality.** Each Party shall use Confidential Information only to perform this Agreement, protect it with reasonable care, and not disclose it to third parties except to advisors, insurers, or subcontractors under need-to-know and equivalent obligations.

9.2 **Health and personal data.** The Client is the **data controller** for patient and prescription personal data processed through the Platform. The Developer is a **data processor** developing and hosting on the Client’s behalf, consistent with Law No. 058/2021 relating to protection of personal data and privacy and applicable health-sector guidance.

9.3 **Processor obligations.** The Developer shall: process personal data only on documented Client instructions and the SRS; implement appropriate technical and organizational measures (including encryption of prescription attachments at rest per SRS NFR-07); restrict staff access; notify the Client without undue delay of a personal data breach the Developer becomes aware of; assist with reasonable compliance requests; delete or return personal data on termination subject to legal retention.

9.4 **Sub-processors.** The Developer may use cloud hosting and notification sub-processors with standard contracts. The Client may object on reasonable grounds to a new sub-processor; if unresolved, the Parties shall negotiate in good faith.

9.5 **Retention.** Default retention proposals in the SRS require Client legal sign-off (Workshop Item 6). Until signed off, the Developer shall configure retention per Client written instruction.

9.6 **Survival.** Sections 7, 9, 11, 13, and 14 survive termination.

---

## 10. Warranties and disclaimers

10.1 **Developer warranty.** For the Defect Fix Period, the Developer warrants that the Platform will substantially conform to the SRS. The Client’s exclusive remedy for breach of this warranty is repair or replacement at Developer’s choice.

10.2 **Client warranty.** The Client warrants that it has authority to enter this Agreement, that supplied content and data do not infringe third-party rights, and that it will use the Platform lawfully.

10.3 **Disclaimer.** Except as in Section 10.1, the Platform and services are provided **as is** after the Defect Fix Period. The Developer does not warrant uninterrupted operation, insurer approval of claims, PMS vendor behaviour, or that the Platform alone ensures regulatory compliance. **The Client remains responsible for dispensing, fiscal receipts in the PMS, and regulatory filings.**

10.4 **No medical device claim.** The Platform is order and workflow software, not a medical device or diagnostic tool.

---

## 11. Limitation of liability

11.1 **Exclusion of indirect damages.** Neither Party is liable for indirect, incidental, special, or consequential damages, including lost profits, except for breach of confidentiality or Client’s payment obligations.

11.2 **Cap.** The Developer’s total aggregate liability arising from this Agreement shall not exceed the **fees actually paid** by the Client under Schedule B in the twelve (12) months preceding the claim.

11.3 **Exceptions.** Nothing limits liability for fraud, wilful misconduct, or death or personal injury caused by negligence where limitation is not permitted by law.

---

## 12. Term and termination

12.1 **Term.** This Agreement begins on the Effective Date and ends when all Deliverables are accepted, full payment is received, and the Defect Fix Period has expired, unless terminated earlier.

12.2 **Termination for convenience.** Either Party may terminate on **thirty (30) days** written notice. The Client shall pay milestone amounts for work completed through termination (including any milestone whose deliverables were substantially delivered before notice), plus documented non-cancellable third-party costs, capped at the fixed fee in Schedule B.

12.3 **Termination for cause.** Either Party may terminate immediately if the other materially breaches and fails to cure within **fourteen (14) days** of written notice, or if the other becomes insolvent.

12.4 **Effect of termination.** On termination, the Developer shall deliver work-in-progress and documentation paid for. Sections 7, 9, 11, and 13 survive. If the Client terminates without cause after substantial work, Milestones earned and reasonable wind-down costs apply.

---

## 13. Governing law and disputes

13.1 **Governing law.** This Agreement is governed by the laws of the **Republic of Rwanda**.

13.2 **Negotiation.** The Parties shall first attempt good-faith negotiation for fifteen (15) business days.

13.3 **Courts.** If unresolved, disputes shall be submitted to the competent courts of **Kigali, Rwanda**, unless the Parties agree in writing to arbitration under _______________________________ rules.

---

## 14. General

14.1 **Entire agreement.** This Agreement, the SRS, the Quotation, and Schedules A to D constitute the entire agreement and supersede prior discussions, including informal messages about price or scope.

14.2 **Order of precedence.** If there is a conflict: (1) a signed Change Order; (2) this Agreement body; (3) Schedule A; (4) the SRS; (5) the Quotation narrative. Payment amounts in Schedule B control over summary tables elsewhere.

14.3 **Amendments.** Amendments must be in writing signed by both Parties.

14.4 **Assignment.** Neither Party may assign without the other’s written consent, except the Developer may assign to an affiliate or in connection with a merger, with notice to the Client.

14.5 **Notices.** Notices shall be in writing to the addresses below (or email if confirmed received):

**Developer:** Salanor Ltd, _______________________________, email: _______________________________

**Client:** _______________________________, email: _______________________________

14.6 **Independent contractors.** The Parties are independent contractors. No employment, partnership, or agency is created. The Client is not authorized to bind the Developer.

14.7 **Severability.** Invalid provisions shall be modified minimally to be valid; the remainder continues.

14.8 **Counterparts.** This Agreement may be signed in counterparts and scanned copies are binding.

14.9 **Language.** This Agreement is in English. If translated, the English version controls.

---

## SCHEDULE A. Scope documents and exceptions

### Part 1. Incorporated documents

| Document | ID | Version | Date |
|----------|-----|---------|------|
| Software Requirements Specification | SAL-PHARM-SRS-001 | 2.0 | 17 September 2026 |
| Quotation (commercial summary in Schedule B) | SAL-PHARM-QT-001 | as dated | 17 September 2026 |

Copies initialled by both Parties or attached to the signed PDF bundle form part of this Agreement.

### Part 2. Client exceptions to SRS (if any)

List only deviations agreed at signing. If none, write **None**.

| SRS reference | Agreed exception |
|---------------|------------------|
| | |
| | |

---

## SCHEDULE B. Fees, milestones, and indicative timeline

### B.1 Fixed fee total

**RWF 5,400,000** (exclusive of applicable taxes)

### B.2 Milestone payments

| # | Milestone | % | Amount (RWF) | Due |
|---|-----------|---|--------------|-----|
| 1 | Project start | 30% | 1,620,000 | Within 7 days of invoice upon signing; before development starts |
| 2 | UAT Acceptance | 30% | 1,620,000 | Within 7 days of invoice upon written UAT Acceptance |
| 3 | Go-Live | 15% | 810,000 | Within 7 days of invoice on Go-Live date |
| 4 | Post go-live installment 1 | 8.33% | 450,000 | 30 days after Go-Live |
| 5 | Post go-live installment 2 | 8.33% | 450,000 | 60 days after Go-Live |
| 6 | Post go-live installment 3 | 8.34% | 450,000 | 90 days after Go-Live |
| | **Total** | **100%** | **5,400,000** | |

Installments are interest-free. Alternative: **40% / 40% / 20%** at Milestones 1, 2, and 3 only, if both Parties initial here: **[ ] Client  [ ] Developer**

### B.3 Indicative timeline (estimates only)

| Phase | Weeks (approx.) | Notes |
|-------|-----------------|-------|
| Workshop and PMS access | 1 to 3 | Schedule C |
| Patient site and OTC path | 4 to 8 | Staging |
| Rx and pharmacist console | 9 to 14 | Staging |
| Insurance and reports | 15 to 17 | Staging |
| UAT and Go-Live | 18 to 22 | Section 8 |

---

## SCHEDULE C. Workshop items (Client inputs)

The Client shall provide within **twenty-one (21) days** of Effective Date unless another date is agreed in writing:

1. PMS vendor name, version, and integration contact / API documentation.
2. List of insurers and active contracts to enable in checkout.
3. Delivery geography, fees, and cold-chain product list if delivery is offered.
4. Default payment model: pay-at-pickup vs prepay for OTC and Rx.
5. Public branding: legal name, logo, single branch vs chain presentation.
6. Written retention period confirmation for prescription images (legal counsel).

---

## SCHEDULE D. Optional care plan (not part of fixed fee unless signed)

The Client may elect ongoing services by signing below. If not signed, hosting may transfer to the Client after Go-Live and Defect Fix Period upon full payment.

| Plan | Monthly fee (RWF) | Includes |
|------|-------------------|----------|
| Care plan | 320,000 | Managed hosting, TLS, backups, monitoring, up to 4 hours minor fixes per month |
| Care plus | 480,000 | Care plan plus priority response, monthly sync health review, security patches |

**Selected plan (circle one):** None / Care plan / Care plus

**Care plan start date:** __________________

**Client signature (optional):** __________________ **Date:** __________________

**Developer signature (optional):** __________________ **Date:** __________________

---

## SIGNATURES

IN WITNESS WHEREOF, the Parties have executed this Agreement as of the Effective Date.

**SALANOR LTD (Developer)**

Signature: _________________________________________

Name: _________________________________________

Title: _________________________________________

Date: _________________________________________

---

**CLIENT (Licensed pharmacy)**

Legal name: _________________________________________

Signature: _________________________________________

Name: _________________________________________

Title: _________________________________________

Date: _________________________________________

---

## Document checklist before signing

- [ ] Schedule A Part 2 completed or marked None  
- [ ] Client TIN, FDA reference, and addresses filled in header  
- [ ] Developer TIN and address filled in header  
- [ ] SRS v2.0 and Quotation attached or cross-signed  
- [ ] Optional Schedule D decided  
- [ ] Local legal or tax review if the Client or Developer requires it  

*This document is a commercial contract template prepared for Salanor Ltd. It is not legal or tax advice. The Parties should obtain independent legal counsel before signing if they are unsure of their obligations.*
