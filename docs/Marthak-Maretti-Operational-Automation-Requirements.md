# Operational automation requirements
## Marthak and Maretti Sette

| Field | Value |
|-------|--------|
| Version | 1.3 |
| Date | 28 October 2026 |
| Sponsor | Gabriel |
| Operations | Martine / Amina |
| Author | Landry |

---

Internal delivery checklist. Client-facing proposal: `Marthak-Maretti-Automation-Platform-Decision-and-Service.md`.

---

## 1. Background

Automate shipping, alerts, and basic email follow-up on Marthak (Shopify) and Maretti Sette (WooCommerce).

---

## 2. System context

| Brand | Platform | Courier |
|-------|----------|---------|
| Marthak | Shopify | Courier Guy (account exists) |
| Maretti Sette | WordPress, WooCommerce (marettisette.com) | Courier Guy (account exists) |

Target operating model: one fixed collection address, daily pickup, equivalent automation behaviour on both brands where the platform allows.

---

## 3. Sponsor objectives

- Integrate Courier Guy on **Marthak and Maretti Sette** and automate delivery steps: collection booking, waybills, tracking, and customer delivery updates where technically supported.
- Reduce manual use of the Courier Guy consumer app for routine orders.
- Automate other high-value store workflows that remove repetitive work for the owner (notifications, cart recovery, customer self-service).
- Keep both stores maintained and ready for growth features (e.g. Google Merchant connection on Maretti) without mandatory ad spend.

---

## 4. Target fulfilment workflow (after implementation)

1. Customer completes checkout on Shopify or WooCommerce.
2. Order reaches the agreed fulfilment trigger status (default: paid or processing).
3. System creates Courier Guy shipment and waybill from order data.
4. System books or registers collection according to daily pickup rules.
5. Tracking is stored on the order; store marks fulfilment complete.
6. Customer receives store email with tracking link; further status updates use store email and/or Courier Guy tracking where sync is available.
7. Owner packs parcel and applies label (physical step remains).

---

## 5. Functional requirements

### 5.1 Courier Guy (priority)

Applies to Shopify (Marthak) and WooCommerce (Maretti). Both must reach the same operational outcome.

| ID | Requirement |
|----|-------------|
| C-1 | Connect each store to Courier Guy using supported Shopify and WooCommerce integrations. |
| C-2 | Create shipment and waybill from order shipping data without retyping in the Courier Guy app for standard domestic orders. |
| C-3 | Default service level and fare rules configured once; manual override per order when needed. |
| C-4 | Daily batch: process all orders ready to ship in one session (aligned with daily collection). |
| C-5 | Book or register collection with Courier Guy per account rules (automated where the integration supports it; otherwise one-click batch from admin). |
| C-6 | Write tracking and waybill reference to the order record. |
| C-7 | Complete fulfilment in the store so the customer receives email with tracking link. |
| C-8 | Where the integration supports it, sync Courier Guy status to the order and send customer notification on shipped or delivered (email via store). |
| C-9 | Export or print waybills from admin; optional thermal printing via PrintNode or equivalent if hardware is supplied (see section 5.6). |
| C-10 | Successful live or test shipment on each store before go-live. |

### 5.2 Owner notifications

| ID | Requirement |
|----|-------------|
| N-1 | Email to operations when an order is paid or ready to process. |
| N-2 | Low-stock alerts on both stores where inventory is tracked. |
| N-3 | Optional weekly summary email (orders, low stock). |

### 5.3 Abandoned cart recovery

| ID | Requirement |
|----|-------------|
| A-1 | Cart recovery on Shopify (Marthak) and WooCommerce or MailPoet (Maretti). |
| A-2 | Configurable delay and message templates. |
| A-3 | Unsubscribe and marketing compliance respected. |

### 5.4 Customer self-service

| ID | Requirement |
|----|-------------|
| I-1 | FAQ pages: shipping times, tracking, how to contact the brand. |
| I-2 | Return and exchange requests: contact form or mailto to operations (no automatic refunds). |
| I-3 | Optional WhatsApp saved replies pointing to FAQ and tracking. |

### 5.5 Store maintenance and readiness

| ID | Requirement |
|----|-------------|
| M-1 | Maretti: plugin and core updates with documented backup procedure (Afrihost). |
| M-2 | Social profile links correct on Maretti (Facebook, Instagram). |
| M-3 | Google for WooCommerce kept current for optional Merchant Center use; ads optional later. |
| M-4 | Marthak: apps and theme compatibility verified for shipping integration. |

### 5.6 Optional add-ons (separate quote)

| ID | Requirement |
|----|-------------|
| O-1 | Auto-print labels (PrintNode and thermal printer). |
| O-2 | Automated WhatsApp shipping updates (Business API). |

---

## 6. Out of scope

- Automatic refunds or exchange approval.
- Google Ads management.
- Supplier ordering automation.

---

## 7. Client inputs

| Item | Responsible party |
|------|---------------------|
| Courier Guy account access | Operations |
| Shopify and WooCommerce admin access | Operations |
| Collection address and pickup contact | Operations |
| Default parcel weight and size rules | Operations |
| Notification email addresses | Operations |
| Abandoned cart settings approval | Operations |
| Go-live approval per store | Sponsor or operations |
| Hardware for O-1 if required | Client |

---

## 8. Acceptance criteria

| Area | Criterion |
|------|-----------|
| Courier Guy | Each store: shipment from admin without courier app data entry for standard orders; tracking on order; customer tracking email; collection booked or registered per C-5. |
| Delivery updates | C-8 implemented where integration allows, or documented limitation with manual step. |
| Notifications | Paid-order and low-stock tests passed. |
| Abandoned cart | Test recovery email received. |
| FAQ and returns intake | Pages live and linked from footer or menu. |

Written sign-off from sponsor or operations.

---

## 9. Implementation sequence

1. Courier Guy on Maretti Sette (WooCommerce), then Marthak (Shopify).
2. Owner notifications.
3. Abandoned cart recovery.
4. FAQ and returns intake.
5. Handover and runbook for daily shipping.
6. Optional add-ons only after written approval.

---

## 10. Commercial

Fixed fee and invoice terms in a separate quotation after approval of this document. Scope in section 5.1 through 5.5 is the base package; section 5.6 is excluded unless quoted.

---

## 11. Approval

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Sponsor | | | |
| Operations | | | |
| Implementation | Landry | | |

Changes after approval require written agreement.
