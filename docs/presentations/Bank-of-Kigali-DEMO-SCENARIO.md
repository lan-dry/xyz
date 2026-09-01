# Bank of Kigali · Full demo scenario · Vendor payment control

**→ Full setup A to Z (start here tonight):** `BANK-OF-KIGALI-DEMO-SETUP-A-TO-Z.md`

**Use this file for:** story, in-room script, and what to say during the demo.

**Workflow file:** `integrations/n8n-nodes-salanor-aegis/examples/bank-of-kigali-vendor-payment-demo.json`

---

## 1. The story (what you tell them in 60 seconds)

> *"Imagine Bank of Kigali rolls out an **AI-assisted vendor payment workflow**. The system reads an approved purchase order and prepares the payment automatically — faster operations, fewer manual steps.*
>
> *The risk: without a control layer, **USD 2,847.50** could leave the operations account **immediately** — no pause, no named approver, weak proof for internal audit or BNR review.*
>
> *With **Salanor Aegis**, the same workflow **stops** at the policy gate. A **Head of Payment Operations** sees the amount, vendor, PO reference, and who initiated the request. **No approval → no payment.** Every step is signed and exportable.*
>
> *This is the protection layer — whether the trigger is AI, automation, or a script. I'll show you live."*

---

## 2. Scenario facts (memorize)

| Field | Value |
|-------|--------|
| **Use case name** | AI-assisted vendor payment (procurement) |
| **Bank** | Bank of Kigali (demo sandbox — same config as production deployment) |
| **Tool** | `app.payments.transfer` |
| **Amount** | **USD 2,847.50** |
| **Limit (policy)** | **USD 1,000** per tx + **USD 3,000** daily total → require human approval |
| **Vendor** | Rwanda Medical Supply Ltd |
| **Vendor account** | Acct ***4821 · BNR 040-028**** |
| **Source account** | BK Operations USD · ****7739 |
| **PO reference** | PO-2026-8842 |
| **Purpose** | Medical IT equipment · Procurement |
| **Initiated by** | AI-assisted invoice workflow (vendor payment bot) |
| **Department** | Procurement · Bank of Kigali HQ |
| **Approver role (in room)** | Head of Payment Operations / delegated signatory |

**Organization in Salanor console:** use your production org (e.g. Salanor Ltd). In the room, say:

> *"This runs on our platform today — configured the way we deploy for a bank. Your instance would be **Bank of Kigali's isolated organization**, your policies, your approvers."*

Optional: if you can rename the org display name before tomorrow to **"BK Demo Sandbox"**, do it — not required.

---

## 3. Console setup (tonight · exact steps)

### A. Policies (two — main demo + anti-structuring)

See **`BANK-OF-KIGALI-DEMO-SETUP-A-TO-Z.md` Part 1 Step 2** for full detail.

| Policy | Rule | Limit |
|--------|------|-------|
| `BK · Vendor payment · per-tx limit` | Max per transaction | USD 1,000 → require approval |
| `BK · Daily payment cap · anti-structuring` | Daily total (24h) | USD 3,000 → require approval |

### B. Agent

**Console → Agents**

- **Workflow Bridge:** ON  
- Copy **ingest API key** into n8n credential  
- Note **Organization ID** and **Agent ID** in the workflow JSON  

### C. n8n workflow

1. Import `bank-of-kigali-vendor-payment-demo.json`  
2. Set org ID, agent ID, credential on **both** Aegis nodes  
3. Save workflow as: **BK Demo · Vendor payment**  

### D. Pre-run (before you leave home)

1. Run workflow once → approve in console when blocked  
2. Confirm: **Approvals → History → APPROVED** with USD 2,847.50 and vendor visible  
3. Confirm: **Traces → COMPLETED** trace exists  
4. Optional: create **Export** for last 7 days → READY  

---

## 4. Full workflow diagram (say this if they ask "how it fits")

```
[Invoice / AI workflow completes]
        ↓
[Payment request built: amount, vendor, PO, source account]
        ↓
[Aegis · Policy check]  ←── YOU ARE HERE (protection layer)
        ↓
   Over USD 1,000? ──Yes──→ [BLOCK] → [Approver in console] → Approve / Refuse
        │                              │
        No                             Refuse → STOP (no core banking call)
        ↓
[Core banking API · execute transfer]  (simulated in n8n demo)
        ↓
[Aegis · Record signed trace + export for audit]
```

**In production:** n8n might be replaced by BK's orchestrator or an AI platform — **Aegis stays at the gate**.

---

## 5. Live demo script (12 minutes · word for word)

### Step 0 · Data & trust (~2 min) — BEFORE app.salanor.com

**Do not skip this.** See full script in `Bank-of-Kigali-AI-USE-CASES.md` → Data privacy section.

> *"Before the console: Salanor is external. You don't send us card numbers or full account numbers for governance. Isolated BK tenant, masked references in traces, BYOK in production, no training on your data. The demo uses PO and masked accounts — same as we recommend in production."*

---

### Step 1 · Story + open console (~30 sec)

> *"I'll use a **vendor payment** scenario — the kind of flow AI and automation touch first. Amount **USD 2,847.50** to **Rwanda Medical Supply Ltd**, PO **8842**. Your rule: anything above **USD 1,000** needs a **named approver** before the core system executes."*

---

### Step 2 · Approvals history (~2 min)

**Open:** `app.salanor.com` → **Approvals** → **History**

**Say:**

> *"Here is a request that already went through the gate. You see **USD 2,847.50**, the vendor, the PO line, who approved, and when. This is not an email thread — it's a **governance record** tied to one trace."*

**Point at:** amount, recipient/summary, APPROVED status, approver email, timestamp.

---

### Step 3 · Trace replay (~2 min)

**Open:** **Traces** → latest **COMPLETED** trace

**Say:**

> *"Every step is a signed entry: policy evaluation, human approval, execution. I can open any step. If internal audit or BNR asks what happened on PO-8842, you **replay** this — you don't reconstruct from five systems."*

**Click:** policy step → approval step → execution step.

---

### Step 4 · Live block (~3 min)

**Open:** n8n → **BK Demo · Vendor payment** → **Execute workflow**

**Say while it runs:**

> *"I'm simulating the same payment job — AI-assisted workflow preparing the transfer. Watch the console…"*

**Switch to Approvals → Pending** (or workflow waiting)

> *"It **stopped**. USD 2,847.50 does not leave the account. Without someone authorized in this console, **nothing executes** — whether the trigger was AI or a scheduled job."*

**Show pending request details:** vendor, PO, department, initiated_by field.

---

### Step 5 · Approve live (~2 min)

**Console → Approve**

**Say:**

> *"I'm acting as **Head of Payment Operations** — the role you'd assign in production. One click. The workflow continues only after this."*

**Wait** for n8n to finish → **Traces** → same trace now **COMPLETED**.

> *"Same trace ID from block to completion. One chain of proof."*

---

### Step 6 · Export (~2 min)

**Console → Exports** → create or open recent export

**Say:**

> *"For your compliance team: bundle by period, integrity hash, structured content. Today the ZIP includes **SOC 2** and **EU AI Act** control mappings — documentation for **your** audit, not a claim that Salanor is certified. This is what **protection** looks like in practice: **control before action, proof after."*

---

### Step 7 · Optional — anti-structuring (~1 min)

**If time and prep done** (see `BANK-OF-KIGALI-DEMO-SETUP-A-TO-Z.md` Appendix B):

**Open:** Console → **Policies** → show `BK · Daily payment cap · anti-structuring`

**Say:**

> *"A per-transaction limit is not enough. Attackers split payments — four times USD 950 stays under one thousand each. Our **daily total** rule catches that pattern. Same tool, second policy, same approval gate."*

**Optional live:** run `bank-of-kigali-structuring-demo.json` (4th USD 950 payment blocks on daily cap).

---

### Step 8 · Close demo (~30 sec)

> *"Same mechanism for a limit change, a KYC exception, or any AI-initiated action that touches money or client data. **Aegis is the layer that lets Bank of Kigali adopt AI without betting the institution on blind automation."*

---

## 6. If something breaks

| Problem | What you do |
|---------|-------------|
| Wi‑Fi down | Show pre-run **APPROVED** history + **COMPLETED** trace + Loom on phone |
| n8n fails | *"I'll show the completed path — the live block behaves the same"* → History + Traces |
| Policy wrong | Fall back to smoke test amounts (USD 2,500 / 1,000) — story unchanged |
| They ask "is this our data?" | *"Sandbox narrative mirroring your vendor payment control. Your deployment is your org, your keys, your policies."* |

---

## 7. What NOT to say

| Avoid | Say instead |
|-------|-------------|
| "Design partner" / "help us build the product" | "Governance layer you deploy on your workflows" |
| "We're early stage, we need you" | "This is running in production on our platform; tomorrow we configure it for BK" |
| "We secure all AI" | "We secure **sensitive actions** — payments, account changes, regulated operations" |
| "Certified SOC 2" | "Export includes SOC 2 **control mapping** for your audit" |

---

## 8. What success looks like tomorrow

They say something like:

- *"Could this sit in front of our payment API?"*  
- *"Who would we assign as approver?"*  
- *"Can we see this on our own workflow?"*  

You reply:

> *"Yes. Next step: a short scoping session with your payment ops, risk, and IT — we map **one** BK workflow and deploy the same gate. You keep core banking; we add the control layer."*

**Goal:** trust + follow-up meeting — not a signature on the spot.

---

## 9. Tonight checklist

See **`BANK-OF-KIGALI-DEMO-SETUP-A-TO-Z.md`** final checklist. Minimum:

- [ ] Policy A (per-tx USD 1,000) + Policy B (daily USD 3,000) active  
- [ ] Workflow imported, IDs set, credentials on both Aegis nodes  
- [ ] Pre-run complete → APPROVED + COMPLETED trace  
- [ ] Read **Section 5** out loud once  
- [ ] Loom backup recorded  
- [ ] Laptop charged, hotspot tested  
- [ ] **No Error Trigger** needed for this demo  

Good luck.
