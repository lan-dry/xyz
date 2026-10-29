# The Courier Guy — full delivery automation  
## Marthak & Maretti Sette (WooCommerce)

**Document version:** 1.0  
**Date:** 27 October 2026  
**Prepared for:** Marthak Project (Gabriel / Martine / operations)  
**Prepared by:** Landry — Forty8ight / Salanor  
**Sites in scope:** [marthak.co.za](https://marthak.co.za), [marettisette.com](https://marettisette.com)

---

## 1. Executive summary

Both brands run **WooCommerce**. This engagement delivers **The Courier Guy (TCG)** integrated on **both stores** with **maximum practical automation**: routine orders should not require manual work in the TCG portal for booking collections, generating waybills, attaching tracking, or notifying customers.

Payment issues (Payfast, PayJustNow, etc.) remain a **separate workstream** (e.g. Amina). Courier automation proceeds in parallel.

**Fixed once-off fee:** **R 24 000** (twenty-four thousand rand), **excluding VAT**.  
VAT at 15% where applicable: **R 27 600** inclusive.

---

## 2. Client request (reference)

Automate the delivery process as far as possible on **Marthak** and **Maretti Sette**, including:

- Booking collections  
- Generating waybills  
- Tracking parcels  
- Sending delivery updates to customers  

Goal: reduce manual handling by operations (e.g. Amina) while PayJustNow / other payment items are resolved separately.

---

## 3. Objectives

| # | Objective |
|---|-----------|
| O1 | Single, consistent shipping workflow on both WooCommerce stores |
| O2 | Auto-create TCG shipments for qualifying orders without portal duplication |
| O3 | Tracking numbers and statuses visible in WooCommerce and to customers |
| O4 | Automated customer notifications when orders ship (and where supported, in transit / delivered) |
| O5 | Clear written handover so staff know the happy path and exceptions |

---

## 4. In scope — full automation (both sites)

Each item below is implemented on **marthak.co.za** and **marettisette.com** unless a platform limitation is documented in writing during implementation.

### 4.1 Courier Guy account & plugin

- Confirm or assist setup of **TCG merchant account(s)** (one shared account or two — per client decision; configuration for chosen model).
- Install and configure **The Courier Guy WooCommerce integration** (official/supported plugin or current recommended integration).
- Configure **collection address(es)**, default parcel parameters, and allowed service levels aligned with how each brand ships.
- Configure **shipping zones, methods, and checkout rates** so customers see correct TCG options (or flat rules as agreed).

### 4.2 Order-triggered automation

- Define trigger with client (default: order reaches **Processing** after payment, or **Paid** — documented in handover).
- **Automatically create shipment / waybill** in TCG for orders that pass rules (valid SA address, shippable line items, weight/dimensions within defaults).
- Attach **tracking reference** to the WooCommerce order.
- Update order **status** per agreed rules (e.g. move toward **Completed** or custom “Shipped” when TCG confirms dispatch, where plugin/API allows).

### 4.3 Customer communication

- Ensure **WooCommerce “order shipped”** (or equivalent) emails include **tracking link / waybill reference** from TCG.
- Align email copy with brand where minimal edits are required (standard templates; no full rebrand).

### 4.4 Operations & admin

- Document **bulk vs single-order** behaviour in wp-admin.
- Reduce routine need to log into **TCG web portal** for standard orders.
- **Exception list** documented: e.g. missing phone, PO box only, international, oversize, manual hold, split fulfilment.

### 4.5 Technical completion layer

Where the plugin alone does not meet the automation above, implement **WooCommerce hooks, small custom code, or operator automation (e.g. n8n)** in the **same project** — not as a separate optional phase. Goal: meet section 4.2–4.3, not “plugin only.”

### 4.6 Testing & handover

- **Test shipments** on each site (live or TCG test mode per account capability).
- End-to-end test: checkout → pay (existing gateway) → trigger → waybill → tracking on order → customer email.
- **Handover session** (up to 90 minutes, remote): walkthrough for Martine / Amina / designated ops.
- **Written runbook** (PDF or shared doc): daily ops, exceptions, who to call at TCG.

### 4.7 Post-go-live warranty

- **30 calendar days** from go-live on the **second** site: fix defects in **this integration’s configuration and automation** at no extra charge (not theme redesign, unrelated plugins, or Payfast/PayJustNow).

---

## 5. Out of scope

| Item | Notes |
|------|--------|
| Payfast, PayJustNow, Payflex, PayPal | Separate payment / verification work |
| Google Merchant Center / Ads | Separate |
| Plugin/theme bulk updates unrelated to TCG | Already done or separate maintenance agreement |
| **Physical** packing, weighing every SKU, inventory counts | Merchant operations |
| **WhatsApp** delivery notifications | Requires WhatsApp Business API / third-party subscription — quote separately if requested |
| New website design, Elementor rebuilds | Not part of this quote |
| TCG **label/courier charges** | Billed by TCG to merchant account |
| Ongoing monthly maintenance after warranty | Optional retainer — not included |
| Custom ERP, Protos platform, multi-tenant product | Not included |

---

## 6. Technical specification (summary)

| Layer | Approach |
|-------|----------|
| Store | WordPress + WooCommerce (both sites) |
| Courier | The Courier Guy (South Africa) |
| Integration | TCG WooCommerce plugin + extensions as required |
| Automation trigger | WooCommerce order status (agreed: typically **Processing**) |
| Data | Shipping address, line items, weight/dimensions (defaults + product weights where set) |
| Notifications | WooCommerce transactional emails + TCG tracking data |
| Hosting | Existing: Marthak (domains.co.za / DirectAdmin), Maretti Sette (Afrihost cPanel) — no migration |

---

## 7. Client responsibilities (before & during)

Client provides within **5 business days** of project start (or agreed date):

1. **TCG merchant account** access (login or invited user) for implementer.  
2. **Collection address(es)** and contact person for driver collection.  
3. **Default parcel rules** (typical weight/size; fallback if products lack weights).  
4. **WordPress admin** access for both sites (Administrator).  
5. **Decision:** one TCG account for both brands or two — and which legal entity invoices TCG.  
6. **Named approver** for go-live on each site.  
7. Availability for **one** handover call and answers on test orders within **48 hours** during testing week.

Delays in the above extend the timeline accordingly.

---

## 8. Implementation sequence (internal — single delivery to client)

1. Discovery call (30 min) — triggers, accounts, parcel defaults.  
2. Maretti Sette — TCG + automation + test.  
3. Marthak — replicate configuration (adjusted for brand-specific zones/rates if needed) + test.  
4. Handover + runbook.  
5. Warranty period begins.

**Estimated duration:** **10–15 business days** from receipt of all access and prerequisites (not calendar weeks of idle time).

---

## 9. Acceptance criteria

Project is **accepted** when, on **each** site:

- [ ] A test order (or agreed live test) generates a **TCG waybill/shipment** without manual TCG portal steps for the standard case.  
- [ ] **Tracking** appears on the WooCommerce order admin and in the customer-facing flow (email or order view, as configured).  
- [ ] **Customer email** for shipment includes tracking information.  
- [ ] Runbook delivered and handover completed.  
- [ ] Client approver confirms sign-off in writing (email or WhatsApp to project thread).

---

## 10. Quote & commercial terms

| Item | Amount |
|------|--------|
| **The Courier Guy full automation — Marthak + Maretti Sette (WooCommerce)** | **R 24 000** |
| VAT (15%) | R 3 600 |
| **Total inclusive of VAT** | **R 27 600** |

**Type:** Fixed price, once-off.  
**Not included:** TCG shipping charges, third-party SaaS (WhatsApp API), VAT on client’s courier usage.

**Payment terms (proposed):**

- **50%** (R 12 000 excl. VAT / **R 13 800** incl.) on acceptance of this quote and start date.  
- **50%** on completion and acceptance (section 9).

Alternative by agreement: **100%** on completion for existing relationship — must be agreed in writing.

**Validity:** This quote is valid for **30 days** from document date.

---

## 11. Sign-off

By approving this quote, the client agrees to scope (sections 4–5), responsibilities (section 7), payment terms (section 10), and acceptance (section 9).

| | Name | Signature / date |
|---|------|------------------|
| Client | | |
| Implementer | Landry | |

---

## 12. Appendix — WhatsApp summary (optional paste)

> **Courier Guy — both Woo stores**  
> Fixed price **R 24 000 ex VAT** (**R 27 600 incl.**) for full automation on Marthak + Maretti Sette: TCG connected, auto waybill when orders are ready to ship, tracking on orders, customer shipping emails, testing + handover. PayJustNow stays separate. Need TCG login, collection address, WP admin both sites, and who approves go-live.

---

*End of document*
