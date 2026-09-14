# Speaker notes · Bank of Kigali · Full demo script

**Deck:** `Salanor-Bank-of-Kigali-AI-Governance.pptx`  
**Demo bible:** `Bank-of-Kigali-DEMO-SCENARIO.md`  
**Workflow:** `integrations/n8n-nodes-salanor-aegis/examples/bank-of-kigali-vendor-payment-demo.json`

---

## Your positioning (not a design partner)

You are **not** asking Bank of Kigali to help you build a product.

You are offering a **governance and protection layer** they can deploy on their workflows — so AI and automation do not move money or client data without rules, approvers, and proof.

**If you only remember one sentence:**

> *"Aegis is the control layer Bank of Kigali puts in front of sensitive operations — so you can adopt AI without losing accountability."*

---

## The full use case (memorize)

| Item | Detail |
|------|--------|
| **Name** | AI-assisted vendor payment (procurement) |
| **Amount** | USD **2,847.50** |
| **Vendor** | Rwanda Medical Supply Ltd · Acct ***4821 |
| **PO** | PO-2026-8842 · Medical IT equipment |
| **Source** | BK Operations USD · ****7739 |
| **Initiated by** | AI-assisted invoice workflow |
| **Rule** | Above USD **1,000** → Head of Payment Operations approves |
| **Policy name** | `BK · Vendor payment · USD 1,000 limit` |
| **Tool** | `app.payments.transfer` |

**On organization name:** Your Salanor console may show "Salanor Ltd". Say:

> *"This demo runs on our platform today — configured exactly as we deploy for a bank. In production, Bank of Kigali gets its **own isolated organization**, your policies, your approvers, your audit exports."*

---

## Slide 8 · Demo · follow `Bank-of-Kigali-DEMO-SCENARIO.md` Section 5

1. Approvals history → USD 2,847.50, vendor, PO, APPROVED  
2. Traces → COMPLETED → step through  
3. n8n → **BK Demo · Vendor payment** → block  
4. Approve live → trace completes  
5. Exports → hash + compliance mapping  

**Opening line:**

> *"An AI-assisted procurement workflow prepares a vendor payment. Without Aegis, USD 2,847.50 leaves immediately. With Aegis, it stops until an authorized person approves — and you keep the proof."*

---

## Slide 11 · Deploy (not "pilot partner")

> *"We deploy Aegis on **one** of your critical workflows — vendor payments, KYC exceptions, or whatever you choose. You get rules, approvers, signed traces, and exports. Success means **your** audit team validates the proof without us in the room."*

---

## Slide 12 · Discussion

Ask which workflow to **protect first**. Get names. Book scoping call before you leave.

---

## What NOT to say

- "Design partner"  
- "Help us refine the product"  
- "We're not finished yet"  
- "Certified SOC 2"  

---

## Tonight

Run `Bank-of-Kigali-DEMO-SCENARIO.md` Section 9 checklist. Read Section 5 out loud once.
