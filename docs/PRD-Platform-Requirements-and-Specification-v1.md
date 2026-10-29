# Product Requirements & Specification Document

**Product (working name):** TBD — public brand; **Secured by Salanor**  
**Legal entity:** Salanor  
**Version:** 1.0  
**Date:** October 2026  
**Status:** Draft — for development, partners, and investors  

---

## Document type — what this is

This is a **Product Requirements & Specification** document (often called **PRD**, or combined **BRD + SRS** in smaller teams).

| Part | What it covers |
|------|----------------|
| **Requirements** | What the product must do, for whom, and why (business rules, phases, out of scope). |
| **Specification** | How it is structured: core vs sector packs vs connectors, data model, Aegis rules, WooCommerce as first connector. |

For a large enterprise you might split into separate **BRD**, **SRS**, and **API spec**. For now, one document is enough, with **Phase tags** (MVP, v1.5, v2) on each block so engineers do not build the whole vision on day one.

---

## 1. What this company / platform is (plain language)

**We are not:**

- An e-commerce platform (we do not replace WooCommerce, Shopify, or a web shop).
- An ERP (we do not replace Odoo, SAP, Sage, or general ledger, HR, and manufacturing).
- A full supply chain suite (we do not replace WMS, TMS, or enterprise procurement like Coupa).

**We are:**

A **governed operations hub** — software that connects to the tools a business already uses, watches orders and stock (and later purchases and shipments), automates boring alerts and drafts, and **stops or pauses** dangerous steps (refunds, supplier orders, stock changes, customer promises) until a human approves. Every sensitive step can leave a **Salanor audit trace**.

**Short pitch:**  
*Connect your systems. Set limits. We handle the daily ops noise — you stay in control of money and stock.*

**Longer pitch for a supply chain contact:**  
*Same core: connect ERP, spreadsheets, or a store; one approval inbox and audit log. Retail brands might connect WooCommerce; distributors might connect Odoo or CSV first. The engine is shared; the **sector pack** chooses default workflows and connectors.*

---

## 2. Sector packs vs connections (rubriques)

Users should not land on a blank “paste a URL” screen. Onboarding is two steps:

### Step A — Choose your **sector** (rubrique)

This sets default workflows, language, and which connectors we suggest first. It does **not** lock the backend to one industry forever.

| Sector pack (v1 roadmap) | Typical systems | First connectors (priority) |
|--------------------------|-----------------|-----------------------------|
| **Retail & e-commerce** | Online store + courier + Payfast | WooCommerce (first), Shopify, CSV |
| **Supply chain & distribution** | ERP, warehouse, B2B orders, suppliers | CSV/Sheets, webhook, Odoo (when built), Woo if they also sell D2C |
| **More packs later** | Manufacturing, services, etc. | TBD when a paying client appears |

The UI can show: **“What best describes your business?”** → cards with sector name + one sentence.  
Settings later: **Sector pack: Retail & e-commerce** (changeable with warning that workflows may reset).

### Step B — **Connections** (integrations)

Under **Connections**, users add concrete systems:

- Connect WooCommerce  
- Connect Shopify  
- Connect Google Sheets / CSV import  
- Connect ERP (Odoo, Zoho, …) — as each adapter ships  
- Custom webhook (advanced)

**Sector pack** = recommended template. **Connection** = actual pipe. A supply chain company might choose **Supply chain & distribution** and connect **Sheets + webhook** first, never WooCommerce. A fashion brand chooses **Retail & e-commerce** and connects **WooCommerce**.

Development rule: **build the core and adapter interface first; WooCommerce is adapter #1, not the product definition.**

---

## 3. Architecture principle (so Woo does not trap growth)

```
┌─────────────────────────────────────────────────────────┐
│  UI: sector pack + toggles + approvals + audit          │
├─────────────────────────────────────────────────────────┤
│  Core: policies, notifications, org/users, billing      │
│        Salanor Aegis (check → pause → trace)            │
│        Canonical model: Order, StockLine, Action, Actor   │
├─────────────────────────────────────────────────────────┤
│  Workflow engine (shared): low stock, refund gate, …    │
│        runs on canonical events only                      │
├─────────────────────────────────────────────────────────┤
│  Adapters (one per external system):                    │
│        WooCommerce │ Shopify │ Sheet │ Odoo │ Webhook   │
└─────────────────────────────────────────────────────────┘
```

No workflow should import `WooCommerce` types directly in business logic. Adapters map **in** and **out**. New sector = mostly **config + adapter**, not a fork of the codebase.

If the supply chain partner joins sooner: prioritize **Sheet/webhook + supply chain pack workflows** (reorder suggestion, approval on PO value) in parallel with Woo — still one core.

---

## 4. Problem and users

**Problem:** Operations live in five places (store admin, payment gateway, courier, email, spreadsheet/ERP). Generic automation runs actions with no cap and no proof. Owners either micromanage or avoid automating refunds and supplier steps entirely.

**Primary users (phase 1):** Owner and ops manager at small/mid businesses (5–50 people), SA and East Africa first, selling online or distributing stock.

**Secondary (with supply chain partner):** Ops lead at a distributor — needs approval on purchase and stock adjustments, may not use Woo at all.

---

## 5. Full vision — what the system will do (phased)

Below, **[MVP]**, **[v1.5]**, **[v2]**, **[v3]** mark when we ship. The vision is complete; the build is not.

### 5.1 Core platform (all sectors)

| ID | Capability | Phase |
|----|------------|-------|
| C-1 | Accounts, organisation, roles (owner, ops, read-only) | MVP |
| C-2 | Sector pack selection at onboarding | MVP (Retail pack only; Supply chain pack stub) |
| C-3 | Connections page (named integrations, not generic URL) | MVP |
| C-4 | Policy rules: amount caps, “always approve refunds”, quiet hours | MVP |
| C-5 | Approval inbox (approve / reject / note) | MVP |
| C-6 | Salanor Aegis on gated actions | MVP |
| C-7 | Audit list + export | v1.5 |
| C-8 | Email alerts; WhatsApp optional later | MVP email |
| C-9 | Billing / subscription | v1.5 |

### 5.2 Retail & e-commerce pack (first workflows)

| ID | Workflow | Phase |
|----|----------|-------|
| R-1 | Alert when order is paid (processing) | MVP |
| R-2 | Low stock detection and dashboard | MVP |
| R-3 | Suggested supplier reorder (draft); send only after approval; Aegis if over cap | MVP |
| R-4 | Weekly ops summary (orders, refunds count) | MVP |
| R-5 | High-value order → on hold + approval to release | v1.5 |
| R-6 | Fulfilment reminder if no tracking after N days | v1.5 |
| R-7 | Refund: propose → approve → execute in Woo | v1.5 |
| R-8 | Complaint: classify + draft reply; approve before send if money mentioned | v2 |
| R-9 | Payfast / payment mismatch hint | v2 |

### 5.3 Supply chain & distribution pack (for partner / later sooner)

| ID | Workflow | Phase |
|----|----------|-------|
| S-1 | Stock below minimum → alert | MVP stub / v1.5 live |
| S-2 | Suggested purchase order (draft) from rules | v1.5 |
| S-3 | PO or supplier commit over cap → approval + Aegis | v1.5 |
| S-4 | Inbound webhook / CSV stock sync | v1.5 |
| S-5 | Match inbound shipment to PO (simple) | v2 |
| S-6 | ERP adapter (Odoo or agreed system) | v2–v3 |

If partner confirms timeline, **S-1–S-4** can move before Shopify. Woo retail pack and supply chain pack share **approval + Aegis + notifications**.

### 5.4 What we do not automate (any sector)

- Processing card payments or storing card data  
- Unsupervised refunds or supplier purchases  
- Replacing ERP or store checkout  
- Legal “guaranteed insurance” without an insurer partner  

Payments: we **react** to paid/refunded status from store or gateway; we do not become the payment service provider.

---

## 6. WooCommerce — first connector (specification)

This section defines adapter #1. Other adapters repeat the same pattern against the **canonical model**.

### 6.1 How WooCommerce users work today (reference)

| Area | In Woo | Typical manual work |
|------|--------|---------------------|
| Products / stock | Product edit, stock qty, low stock threshold | Update after counts, email supplier |
| Orders | Pending → Processing → Completed; notes | Watch admin, ship, courier |
| Payments | Payfast etc.; ITN marks paid | Check Payfast if stuck pending |
| Refunds | Order → Refund line items; may sync gateway | Careful clicks, finance alignment |
| Customers / complaints | Email, WhatsApp, contact form | Reply by hand |

Our platform **mirrors** order/stock events and **governs** actions we execute back (notes, status, refund API), not the whole admin UI.

### 6.2 WooCommerce adapter — requirements

| ID | Requirement | Phase |
|----|-------------|-------|
| W-1 | Connect: store URL + REST API key (read; read/write when refunds enabled) | MVP |
| W-2 | Connection test and health (last webhook time) | MVP |
| W-3 | Webhooks: order created/updated; product/stock updated (or poll fallback) | MVP |
| W-4 | Map to canonical Order, LineItem, StockLine | MVP |
| W-5 | Support HPOS (modern Woo order storage) | MVP |
| W-6 | Write order note, status change — only through approval gate | v1.5 |
| W-7 | Create refund via Woo API — only after approval + Aegis | v1.5 |

### 6.3 Connect flow (user-facing)

1. Connections → **Add** → **WooCommerce**  
2. Enter store URL  
3. Create API keys in Woo (documented steps)  
4. Paste keys → **Test connection**  
5. Platform registers webhooks or shows webhook URLs to paste  
6. Status: Connected  

Same pattern later: **Add** → **Odoo** / **Google Sheets** with adapter-specific fields.

---

## 7. Salanor Aegis — when it must intervene

| Action | Default |
|--------|---------|
| Email alert to owner | Allow; light log |
| Draft supplier message | Allow |
| **Send** supplier order / PO | Approve if over cap |
| **Refund** in Woo | Approve (always or over cap — tenant setting) |
| Stock adjustment | Approve |
| AI customer reply that mentions refund or discount | Approve before send |
| Bulk action on many orders | Approve |

Principle: **detect and draft freely; execute money/stock/reputation actions through policy.**

---

## 8. User interface (structure)

- **Dashboard** — today: orders/stock signals, pending approvals  
- **Sector** — current pack; switch (advanced)  
- **Connections** — list of integrations with status  
- **Rules** — toggles and caps  
- **Approvals** — queue  
- **Activity** — audit  
- **Settings** — team, notifications  

No n8n canvas for customers. No “one URL connects everything.”

---

## 9. Non-functional

- Encrypt integration credentials  
- POPIA-aware data handling; document sub-processors  
- Least-privilege API keys  
- Adapter failures visible to support and simplified for client (“Woo connection lost — reconnect”)  

---

## 10. Roadmap (honest)

| When | Deliver |
|------|---------|
| **Now** | Client projects (Woo stores) fund learning; document canonical model in code |
| **MVP** | Core + Retail pack + Woo adapter + R-1–R-4 + Aegis on R-3 send |
| **Partner pull-forward** | Supply chain pack S-1–S-4 + CSV/webhook adapter |
| **v1.5** | Refunds gated (R-7); S-2–S-3 if distributor pilot |
| **v2** | Complaints assist; Shopify; first ERP adapter agreed with partner |

---

## 11. Open decisions

1. Public product name  
2. Supply chain partner: which ERP or file format first?  
3. Refund: Woo API only or also Payfast API?  
4. Pilot: Maretti Sette read-only MVP yes/no  

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| **Sector pack** | Rubrique — template workflows + copy for an industry |
| **Connection** | A live integration to one external system |
| **Adapter** | Code that maps one system ↔ canonical model |
| **Canonical model** | Internal Order / StockLine / Action — not Woo-shaped |
| **Aegis** | Salanor policy check and signed audit trace |

---

*End of document*
