# Software Requirements Specification

## Online pharmacy ordering and fulfilment platform (Rwanda)

| Field | Value |
|-------|--------|
| Document ID | SAL-PHARM-SRS-001 |
| Version | 2.0 |
| Status | Baseline scope for implementation (workshop items in section 24) |
| Date | 17 September 2026 |
| Owner | Salanor Ltd (delivery) / Licensed pharmacy (operator) |

This specification describes the **full** functional behaviour of a patient-facing ordering platform tied to a **licensed retail pharmacy** in Rwanda. It assumes the pharmacy already operates a **pharmacy management system (PMS)** for stock, point of sale, Rwanda Revenue Authority (RRA) fiscal receipts, and (where applicable) Rwanda Social Security Board (RSSB) insurance billing.

The platform is an **order and intake channel**. It does not replace the PMS, the responsible pharmacist, or physical dispensing at a licensed premise except where law and Rwanda Food and Drugs Authority (Rwanda FDA) authorization explicitly allow delivery.

Legal interpretation remains the responsibility of the pharmacy and its counsel. Requirements below translate known rules into **system behaviour** the product must enforce or support.

---

## 1. Purpose

### 1.1 Problem

Patients expect to discover medicines, submit orders (including prescription-based orders), pay or co-pay, and collect or receive delivery without unnecessary visits for routine cases. The pharmacy expects to sell more efficiently while keeping **Good Dispensing Practice (GDP/GPP)**, **prescription registers**, **insurance claim integrity**, and **fiscal compliance** intact.

### 1.2 Objectives

1. Publish an accurate, stock-aware catalog of medicines the pharmacy is allowed to sell online.
2. Accept orders for over-the-counter (OTC) and prescription-only products under distinct rules.
3. Route every prescription order through **pharmacist review** before payment finalization or dispense authorization.
4. Integrate with the PMS so stock, batch/expiry, pricing, fiscal receipt, and insurance claim data stay consistent.
5. Support cash, mobile money, and insured co-payment flows aligned with pharmacy contracts.
6. Provide audit evidence for pharmacist decisions, insurance disputes, and personal data handling.

### 1.3 Success criteria (measurable)

- Zero orders for prescription-only lines reach “ready for dispense” without a logged pharmacist approval tied to a named license holder.
- Catalog availability matches PMS within agreed sync limits (see section 14).
- Every completed sale has a reconcilable link to a PMS transaction and RRA-compliant receipt.
- Insured orders split patient co-pay and insurer portion before payment, with formulary warnings where data exists.
- Patient order status is visible end-to-end with timestamps.

---

## 2. Scope

### 2.1 In scope

- Public pharmacy site and authenticated patient area (mobile web minimum; native apps optional later).
- Staff console for pharmacists and authorized employees.
- Pharmacy owner/admin configuration (single branch at launch; multi-branch ready in data model).
- Product search, cart, checkout, order lifecycle, notifications.
- Prescription capture (image and structured fields), review queue, approval/rejection.
- Pickup and configurable delivery.
- Integration hooks to PMS for catalog, reservations, sale finalization, insurance artifacts.
- Operational and compliance reporting exports.

### 2.2 Out of scope (unless added by change request)

- Manufacturing, wholesale, or hospital-only pharmacy workflows.
- Telemedicine or issuing new prescriptions (platform receives prescriptions; it does not prescribe).
- Full EMR/clinic integration in v1 (reserved interface only).
- National drug registry maintenance (read/reference only if provided).
- Payment aggregator certification work owned by pharmacy contracts (platform implements agreed flows).

---

## 3. Definitions

| Term | Meaning |
|------|---------|
| PMS | Pharmacy management system used in-store (stock, POS, EBM/OSDC, RSSB). |
| OTC | Medicine dispensed without prescription per national lists and pharmacy policy. |
| Rx | Prescription-only medicine requiring valid prescriber authorization. |
| Controlled | Narcotic or restricted schedule; subject to enhanced controls and usually excluded from self-service online purchase. |
| Responsible pharmacist | Licensed pharmacist accountable for the premise per Rwanda FDA rules. |
| Co-pay | Patient portion on an insured transaction (e.g. 15% under RSSB Medical Scheme where applicable). |
| Formulary | Insurer reimbursable drug list (e.g. RHIA list for private schemes; RSSB/MoH lists for public schemes). |
| FEFO | First-expiry-first-out stock rotation at pick time. |
| Order | Patient request grouping one or more lines and fulfilment instructions. |
| Dispense authorization | System record that pharmacist approved release after Rx and clinical checks. |
| PMS sale | Final fiscal and stock transaction recorded in PMS. |

---

## 4. Regulatory and compliance behaviour (functional)

The system shall support the pharmacy’s obligations under:

- Regulations Governing Online Pharmacy Practice (Rwanda FDA, 2020).
- Law No. 12/99 relating to the pharmaceutical art (prescription form, validity, registers, dispensing).
- Rwanda FDA licensing and Good Storage/Distribution Practice for retailers.
- Law No. 058/2021 on personal data and privacy (health data as sensitive).
- RRA requirements that sales finalize through CIS-certified invoicing in PMS.
- RSSB and other insurer rules where the pharmacy holds active agreements.

### 4.1 Mandatory public disclosures

The public site shall display, in a dedicated footer or “Legal” section:

- Licensed pharmacy legal name and Rwanda FDA premise authorization reference (as provided by client).
- Physical address and map link.
- Responsible pharmacist name (configurable when locum cover applies with date range).
- Opening hours and public holiday exceptions.
- Contact phone, email, and complaints process.
- Privacy policy and terms of use (health data called out explicitly).
- Statement that prescription medicines require pharmacist validation before supply.

### 4.2 Prescription validity rules (system-enforced where data exists)

| Rule ID | Behaviour |
|---------|-----------|
| REG-RX-01 | Block dispense authorization if prescription date is older than 30 days unless prescriber validity extension is recorded on the order. |
| REG-RX-02 | Require minimum prescription capture: prescriber name or ID, prescription date, patient name, and at least one legible image OR structured line items entered by pharmacist from the image. |
| REG-RX-03 | Do not allow patient checkout that includes Rx-only SKUs until order status is `pharmacist_approved` (or partial approval with adjusted lines). |
| REG-RX-04 | Log rejecting pharmacist, reason code, and timestamp for every rejected Rx order. |
| REG-RX-05 | Controlled substances: default configuration excludes from online catalog; if client enables exception, require in-person collection flag and second staff confirmation before dispense (see section 10.4). |
| REG-RX-06 | Maintain export aligned to prescription register fields required by MoH/pharmacy council (configurable column map; minimum set in appendix B). |

### 4.3 Personal data

| Rule ID | Behaviour |
|---------|-----------|
| REG-PD-01 | Explicit consent checkbox before first Rx upload or health profile save. |
| REG-PD-02 | Role-based access: patients see only their data; staff see only orders for their branch; export of Rx images restricted to pharmacist and owner roles. |
| REG-PD-03 | Access log for every view/download of prescription attachments (user, time, order id). |
| REG-PD-04 | Support data subject access request export (profile, orders, consents) within configurable retention window. |
| REG-PD-05 | Support account deletion request workflow with legal retention hold for dispensed orders (orders archived, not erased, until retention period ends). |

---

## 5. User roles and permissions

| Role | Capabilities |
|------|----------------|
| Patient (guest) | Browse public catalog (as configured), view static content, start guest checkout for OTC-only if enabled. |
| Patient (registered) | Full cart, addresses, order history, Rx upload, saved insurance ids (optional), notifications preferences. |
| Cashier / sales staff | View orders, update pick status, handover, initiate PMS sale handoff, no Rx approval. |
| Pharmacist | All staff capabilities plus Rx queue, approve/reject/partial approve, substitution recording, dispense authorization, register export. |
| Delivery agent | View assigned deliveries, update delivery status, capture proof of delivery (no Rx image access unless policy allows). |
| Branch manager | Pharmacist capabilities plus staff user management (branch), local catalog visibility toggles, hours, delivery zones. |
| Owner / admin | All branch manager capabilities plus integration settings, insurance scheme toggles, global reports, audit log export. |

Permission changes shall take effect on next login. Sensitive actions require re-authentication if session exceeds configurable idle timeout (default 30 minutes for staff).

---

## 6. Product catalog

### 6.1 Catalog source

- Master product data originates in PMS. The platform maintains a **read model** synchronized on schedule or event.
- Manual override fields (marketing description, hide online) live in platform admin without changing PMS stock logic.

### 6.2 Product attributes (minimum)

| Attribute | Use |
|-----------|-----|
| Internal SKU / PMS id | Integration key |
| Display name | Patient search |
| INN / generic name | Search and substitution |
| Brand name | Display |
| Strength, form, pack size | Cart line clarity |
| Rx flag | Checkout gating |
| Controlled flag | Catalog exclusion and workflow |
| Cold chain flag | Delivery restrictions |
| Unit price (selling) | Checkout |
| Available quantity | Hide or mark unavailable |
| Batch/expiry (optional online) | Show “expires before” warning if policy enables |
| FDA registration reference | Admin audit; optional patient display |

### 6.3 Catalog rules

| ID | Requirement |
|----|-------------|
| CAT-01 | Search by name, INN, and barcode if PMS supplies barcode. |
| CAT-02 | Filter: OTC only, in stock only, price range. |
| CAT-03 | Rx-only products show “Prescription required” and disable one-click purchase. |
| CAT-04 | If stock is zero, product is not purchasable; optional “notify when back” captures phone/email. |
| CAT-05 | Category browsing (OTC categories client defines). |
| CAT-06 | Multi-language labels: English and French minimum; Kinyarwanda where client supplies translations. |
| CAT-07 | No advertising claims violating pharmacy law (admin disclaimer on marketing fields). |

---

## 7. Patient account and profile

| ID | Requirement |
|----|-------------|
| ACC-01 | Registration via mobile number OTP (primary) or email verification (secondary). |
| ACC-02 | Profile: full name, date of birth (optional but recommended for Rx match), gender (optional), default language. |
| ACC-03 | Multiple delivery addresses with label (home, work), GPS pin optional, delivery notes. |
| ACC-04 | Optional national ID number field for insurance verification (encrypted at rest). |
| ACC-05 | Insurance profiles: scheme type, member number, principal member name, card expiry if applicable. |
| ACC-06 | Dependent orders: allow ordering for family member with name and relationship captured on Rx orders. |
| ACC-07 | Communication preferences: SMS, WhatsApp, email toggles per event type. |

---

## 8. Cart and checkout

### 8.1 Cart behaviour

| ID | Requirement |
|----|-------------|
| CART-01 | Separate line types: OTC direct, Rx requested (linked to upload), Rx matched to catalog SKU. |
| CART-02 | Show line-level stock status and price snapshot at add time; refresh price/stock at checkout with user confirmation if changed. |
| CART-03 | Maximum lines and quantity per line configurable (abuse prevention). |
| CART-04 | Cold chain mixed cart warns if delivery selected beyond allowed radius or time window. |
| CART-05 | Save cart for registered users across sessions (TTL configurable). |

### 8.2 Checkout steps

1. Fulfilment method: pickup at premise **or** delivery (if enabled).
2. Address or pickup confirmation.
3. Insurance selection: cash, RSSB, other (if configured), with member validation fields.
4. Prescription upload for any Rx line (if not already linked).
5. Review summary: lines, co-pay split estimate, fees, taxes as applicable.
6. Payment: mobile money, pay at pickup, or hybrid (deposit + balance on pickup) per pharmacy policy.
7. Order confirmation with reference number.

| ID | Requirement |
|----|-------------|
| CHK-01 | Rx orders: payment capture may be deferred until pharmacist approval (recommended default) or limited deposit only. |
| CHK-02 | OTC orders: payment per configured methods before entering fulfilment queue. |
| CHK-03 | Display estimated wait time text (configurable, non-binding). |
| CHK-04 | Terms acceptance recorded with version id and timestamp. |

---

## 9. Prescription intake and pharmacist review

### 9.1 Patient submission

| ID | Requirement |
|----|-------------|
| RX-01 | Accept JPEG, PNG, PDF; max file size configurable (default 10 MB per file); up to 5 files per order. |
| RX-02 | Client-side hints: flat surface, full page, include prescriber stamp/signature. |
| RX-03 | Optional: patient notes (allergies, pregnancy) stored on order, not public. |
| RX-04 | Link uploaded Rx to specific cart lines or “general Rx” for pharmacist to map to SKUs. |

### 9.2 Pharmacist review queue

| ID | Requirement |
|----|-------------|
| RX-10 | FIFO queue with priority flag for urgent delivery orders. |
| RX-11 | Side-by-side view: images, zoom, patient profile, cart lines, insurance context. |
| RX-12 | Structured checklist (appendix A) must be completed before approval; unchecked mandatory items block approval. |
| RX-13 | Actions: approve all, approve partial (adjust quantities/lines), reject, request more info (order status `awaiting_patient`, timer). |
| RX-14 | Record responsible pharmacist license number on approval (selected from registered pharmacists list). |
| RX-15 | Substitution: record original prescribed item, substituted item, reason code, patient contact outcome (spoken consent / prescriber callback reference). |
| RX-16 | Partial approval notifies patient with revised total and new payment step if needed. |

### 9.3 Prohibited automation

The system shall **not** auto-approve prescription orders based solely on image upload or optical character recognition. OCR may assist staff by prefilling fields; pharmacist confirmation remains mandatory.

---

## 10. Order lifecycle and state machine

### 10.1 Order statuses

| Status | Meaning |
|--------|---------|
| `draft` | Cart not submitted |
| `submitted` | Order placed; payment pending per rules |
| `awaiting_payment` | Approved but payment incomplete |
| `awaiting_pharmacist_review` | Rx or clinical gate pending |
| `awaiting_patient` | Pharmacist requested clarification |
| `rejected` | Pharmacist or system rejected; reason recorded |
| `approved` | Pharmacist authorized fulfilment |
| `allocating_stock` | Reservation in PMS in progress |
| `picking` | Staff picking batches |
| `ready_for_pickup` | Packed; awaiting patient |
| `out_for_delivery` | With delivery agent |
| `delivered` | Delivery confirmed |
| `completed` | Handover and PMS sale finalized |
| `cancelled` | Cancelled before dispense; stock released |
| `refund_pending` | Refund initiated |
| `refunded` | Refund closed |

Valid transitions shall be enforced server-side (invalid transition returns error to staff UI).

### 10.2 Line item statuses

Independent per line: `pending`, `approved`, `substituted`, `rejected`, `picked`, `dispensed`, `returned`.

### 10.3 Timers and SLAs (configurable)

- Target pick time for OTC paid orders.
- Max time in `awaiting_pharmacist_review` before escalation alert to branch manager.
- Reservation TTL in PMS before auto-release if order cancelled.

### 10.4 Controlled and high-risk orders

| ID | Requirement |
|----|-------------|
| ORD-CR-01 | Controlled lines require manager or second pharmacist confirmation step before `picking`. |
| ORD-CR-02 | Order total above configurable threshold triggers secondary approval (owner or senior pharmacist). |
| ORD-CR-03 | Insurance exception (non-formulary item on insured order) triggers explicit patient consent capture and staff acknowledgment. |

---

## 11. Fulfilment: pickup and delivery

### 11.1 Pickup

| ID | Requirement |
|----|-------------|
| FUL-P-01 | Generate pickup code (6 to 8 digits) or QR shown to patient. |
| FUL-P-02 | Handover requires staff to verify code and patient name; optional ID check for Rx orders. |
| FUL-P-03 | Record handover staff id and timestamp before `completed`. |
| FUL-P-04 | Bag labels print or display: order id, patient name, cold chain icon if applicable. |

### 11.2 Delivery

| ID | Requirement |
|----|-------------|
| FUL-D-01 | Delivery zones by radius or sector list; fee table per zone. |
| FUL-D-02 | Time windows (same day cut-off configurable). |
| FUL-D-03 | Cold chain orders: restrict to zones and max transit time; block if outside policy. |
| FUL-D-04 | Assign delivery to agent; status updates `out_for_delivery` → `delivered`. |
| FUL-D-05 | Proof of delivery: OTP, photo, or signature capture. |
| FUL-D-06 | Failed delivery: reason codes, reschedule, return to stock workflow. |

---

## 12. Payments, refunds, and fiscal reconciliation

### 12.1 Payment methods

| Method | Behaviour |
|--------|-----------|
| Mobile money (MTN/Airtel) | Initiate STK or redirect; webhook confirms; idempotent handling of duplicate callbacks. |
| Pay at pickup | Order proceeds to picking; payment recorded in PMS at handover. |
| Insurance co-pay only | Charge patient portion online; insurer portion via PMS claim. |
| Mixed | Co-pay online + adjustment at pickup if claim rejected partially. |

| ID | Requirement |
|----|-------------|
| PAY-01 | No PMS sale marked complete until payment state matches pharmacy policy for that order type. |
| PAY-02 | Store gateway transaction ids on order for reconciliation report. |
| PAY-03 | Refund initiates only from staff with permission; links to RRA credit note process in PMS (manual confirmation step if integration not automated). |
| PAY-04 | Partial refund for partial cancellation or rejected lines after payment. |

---

## 13. Insurance and third-party payers

### 13.1 Scheme configuration (admin)

Per scheme record:

- Name (RSSB Medical, MMI, private insurer X).
- Active contract flag and branch agreement reference.
- Default co-pay percentage if known.
- Formulary source: static upload (CSV) or PMS-driven flag per SKU.
- Claim submission mode: PMS-native only (default) or platform-assisted payload export.

### 13.2 Patient-facing insurance behaviour

| ID | Requirement |
|----|-------------|
| INS-01 | Patient selects scheme at checkout; enter member id and verify against format rules. |
| INS-02 | Line-level indicator: covered, not covered, prior authorization required. |
| INS-03 | Cart re-prices to show patient portion and insurer portion before payment. |
| INS-04 | Warn when CBHI/Mutuelle selected but pharmacy has no CBHI billing integration (default: inform that standard visit coverage may not apply to private pharmacy purchase). |
| INS-05 | Block checkout on known non-formulary lines unless patient switches to cash for those lines. |
| INS-06 | Capture referral letter upload if scheme requires for specialty items. |
| INS-07 | High cumulative prescription value flag per RSSB practice (configurable threshold) for staff to confirm advisor authorization before dispense authorization. |

### 13.3 Back-office insurance tracking

| ID | Requirement |
|----|-------------|
| INS-20 | Dashboard: claims submitted, pending reimbursement, rejected claims with reasons. |
| INS-21 | Link each claim to PMS invoice id and platform order id. |
| INS-22 | Export monthly insurer statement reconciliation CSV. |

---

## 14. PMS integration (functional contract)

Integration depth is negotiated per vendor. The platform shall support the following **capabilities** regardless of transport (API, file drop, manual bridge).

| ID | Capability |
|----|------------|
| PMS-01 | Import catalog: SKU, names, Rx flags, prices, stock quantity, batch/expiry optional. |
| PMS-02 | Export order: header, lines, patient name, payment state, insurance split. |
| PMS-03 | Stock reservation: create, extend, release on cancel or timeout. |
| PMS-04 | Fulfilment confirmation: consume reservation, attach batch picked, finalize sale. |
| PMS-05 | Receive PMS sale id and fiscal receipt reference back to platform order. |
| PMS-06 | Insurance: trigger co-pay sale and insurer claim record in PMS; return claim status if available. |
| PMS-07 | Error handling: explicit failure codes; staff manual fallback screen with copy-paste order json. |

Sync frequency:

- OTC availability: target 15 minutes maximum staleness; alert if sync fails twice consecutively.
- Rx fulfilment: stock check mandatory at pick time against live PMS query or forced refresh.

---

## 15. Notifications

| Event | Patient | Staff |
|-------|---------|-------|
| Order submitted | Yes | Yes (pharmacist if Rx) |
| Awaiting patient info | Yes | No |
| Approved / partial | Yes | No |
| Rejected | Yes with reason | No |
| Ready for pickup | Yes | No |
| Out for delivery | Yes | Optional |
| Delivered / completed | Yes | No |
| Payment failed | Yes | Optional |

Templates configurable per branch and language. Delivery failures and SLA breaches notify branch manager.

---

## 16. Returns, cancellations, and complaints

### 16.1 Cancellation

| ID | Requirement |
|----|-------------|
| CAN-01 | Patient may cancel before `picking` if policy allows; after picking, must contact pharmacy. |
| CAN-02 | Staff cancel with reason code; release stock reservation; trigger refund workflow if paid. |
| CAN-03 | Rx orders cancelled after approval still retain Rx images per retention policy. |

### 16.2 Returns

| ID | Requirement |
|----|-------------|
| RET-01 | Return request within configurable days (default aligned to pharmacy policy, not software default alone). |
| RET-02 | Pharmacist inspects return eligibility (sealed, cold chain, controlled exclusions). |
| RET-03 | Return finalized in PMS; platform order line marked `returned`. |

### 16.3 Complaints

| ID | Requirement |
|----|-------------|
| CMP-01 | Public complaint form linked from footer; creates ticket with order reference optional. |
| CMP-02 | Staff track complaint status; export for Rwanda FDA or internal quality if needed. |

---

## 17. Reporting and exports

| Report | Audience | Content |
|--------|----------|---------|
| Daily orders summary | Manager | Count by status, revenue, payment method |
| Rx review log | Pharmacist, owner | Approvals, rejections, pharmacist id, durations |
| Prescription register export | Pharmacist | Appendix B columns |
| Insurance pending | Manager | Outstanding claims by scheme |
| Stock sync health | Admin | Last sync, errors, mismatches |
| Audit access log | Owner | Rx file views, permission changes |
| Fiscal reconciliation | Finance | Platform payments vs PMS receipt ids |

All exports timestamped with generating user. CSV and PDF minimum.

---

## 18. Multi-branch (data model and behaviour)

| ID | Requirement |
|----|-------------|
| BR-01 | Each branch has own address, hours, delivery zones, PMS connection profile. |
| BR-02 | Catalog can be shared or branch-specific per SKU availability. |
| BR-03 | Patient selects serving branch at checkout or auto-assign nearest with stock. |
| BR-04 | Staff users scoped to branch unless owner role. |
| BR-05 | Consolidated owner reports across branches. |

---

## 19. Non-functional requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Availability | 99.5% monthly uptime excluding planned maintenance windows announced 48h ahead. |
| NFR-02 | Performance | Product search p95 under 2s on 3G-class latency for typical catalog size. |
| NFR-03 | Performance | Checkout submission p95 under 5s excluding payment gateway. |
| NFR-04 | Localization | English and French UI; extensible strings file for Kinyarwanda. |
| NFR-05 | Accessibility | Forms labeled; contrast meets WCAG 2.1 AA target for patient flows. |
| NFR-06 | Security | TLS for all traffic; staff passwords hashed; lockout after failed attempts. |
| NFR-07 | Security | Rx attachments encrypted at rest; backups encrypted. |
| NFR-08 | Operability | Staff activity logged; configuration changes versioned. |
| NFR-09 | Disaster | Daily backups; documented restore test quarterly (operator responsibility with vendor support). |
| NFR-10 | Offline | PMS continues in-store if platform down; staff SOP for manual order entry documented. |

---

## 20. External interfaces (logical)

| Interface | Direction | Purpose |
|-----------|-----------|---------|
| PMS | Bidirectional | Catalog, reservation, sale, insurance |
| Payment gateway | Inbound webhooks | Confirm mobile money |
| SMS / WhatsApp provider | Outbound | Notifications |
| RSSB (optional) | Via PMS or direct | Eligibility if API available to pharmacy |
| Maps (optional) | Outbound | Address pin, delivery routing assist |

---

## 21. Logical data entities (summary)

Entities and primary relationships:

- **Organization** (pharmacy company) 1..* **Branch**
- **Branch** 1..* **StaffUser** (roles)
- **Patient** 1..* **Address**, 1..* **InsuranceProfile**
- **Product** (mirror) keyed by PMS sku; * **Branch** availability
- **Order** 1..* **OrderLine**; 0..* **PrescriptionAttachment**; 0..1 **InsuranceContext**
- **PharmacistReview** 1..1 **Order** (when Rx path)
- **Payment** *..1 **Order**
- **Delivery** 0..1 **Order**
- **AuditEvent** polymorphic reference to orders, attachments, config

Retention defaults proposed for client legal sign-off: order and Rx data minimum 5 years unless counsel specifies otherwise.

---

## 22. Acceptance criteria (release gate)

Release to production requires:

1. UAT sign-off by responsible pharmacist on 10 scripted Rx scenarios (approve, partial, reject, substitution, expired Rx).
2. UAT on 5 OTC scenarios including out-of-stock and payment failure recovery.
3. If insurance enabled: 3 RSSB co-pay scenarios reconciled to PMS test invoices.
4. RRA receipt produced in PMS for each completed UAT order with matching platform order id.
5. Privacy policy published; consent flows verified.
6. Rwanda FDA online pharmacy authorization evidence on file.
7. Load test: 50 concurrent patient sessions browsing without error rate above 1%.

---

## 23. Assumptions and dependencies

- Pharmacy holds valid retail license and obtains online pharmacy authorization before public Rx sales.
- PMS remains CIS-certified for RRA and is operated correctly in-store.
- Pharmacy maintains RSSB or other insurer agreements before enabling scheme checkout.
- Delivery, if offered, follows written SOPs for medicine transport approved by responsible pharmacist.
- Client provides translated strings, license numbers, and insurance formulary uploads on time.
- Payment merchant accounts are contracted by pharmacy, not by platform vendor alone.

---

## 24. Open items (client workshop)

1. PMS vendor name and integration API availability.
2. List of insurers and active contracts.
3. Delivery geography and cold chain product list.
4. Pay-at-pickup vs prepay default for OTC and Rx.
5. Branding: single store vs chain name on public site.
6. Retention period legal confirmation for Rx images.

---

## Appendix A. Pharmacist review checklist (mandatory items)

Before approval, pharmacist confirms:

1. Prescription legible and authentic to best of professional judgment.
2. Prescriber identifiable and authorized (name, registration if visible, signature/stamp).
3. Patient identity matches order (name; DOB if available).
4. Prescription date within validity.
5. Indication and dose appropriate or clarified with prescriber if needed (note reference).
6. No contraindication flags from patient notes (if provided).
7. Lines in cart match prescription or justified substitution documented.
8. Insurance context verified if insured order.
9. Controlled substance rules satisfied or order rejected.

System stores checklist answers per review record.

---

## Appendix B. Prescription register export (minimum columns)

| Column | Description |
|--------|-------------|
| Register sequence | Auto increment per branch |
| Order id | Platform reference |
| Date dispensed | From PMS sale |
| Patient name | |
| Patient age/sex | If recorded |
| Prescriber name | |
| Prescriber registration | If recorded |
| Product name / INN | Dispensed |
| Form, strength, quantity | |
| Substitution note | If any |
| Pharmacist name and license | Approver |
| Insurance reference | If applicable |

---

## Appendix C. Rejection reason codes (patient-visible subset)

| Code | Patient message (template) |
|------|----------------------------|
| RX_EXPIRED | Prescription is out of date. Please obtain a new one from your doctor. |
| RX_ILLEGIBLE | We cannot read the prescription. Please upload a clearer photo. |
| RX_INCOMPLETE | Information is missing. Our pharmacist will contact you or please re-upload. |
| RX_NOT_MATCHING | Items ordered do not match the prescription. |
| RX_CONTROLLED | This product cannot be supplied through this channel. Visit the pharmacy in person. |
| RX_FAKE_SUSPECT | We cannot process this prescription. Contact the pharmacy by phone. |
| INS_NOT_COVERED | Your insurance does not cover one or more items. Choose cash or remove items. |
| STOCK_UNAVAILABLE | Approved items are out of stock. Partial fulfilment offered. |

---

## Appendix D. References

- Rwanda FDA, Regulations Governing Online Pharmacy Practice (2020).
- Law No. 12/99 relating to the pharmaceutical art.
- Rwanda FDA, licensing regulations for retailers of medical products.
- Law No. 058/2021 relating to protection of personal data and privacy.
- MoH, National Pharmaceutical Products Pricing and Containment Policy.
- RSSB Medical Scheme public descriptions and RHIA reimbursement practice.
- WHO/RSSB assessment of medicine pricing and reimbursement (Rwanda chapter).
- DPO Rwanda, Guidance on Personal Data Protection in the Health Sector.

---

*End of document.*
