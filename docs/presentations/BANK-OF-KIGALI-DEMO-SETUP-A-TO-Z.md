# Bank of Kigali · Demo setup A to Z (save this for tomorrow)

**Master file — all steps in one place.**

| What | File |
|------|------|
| **This guide (setup A→Z)** | `docs/presentations/BANK-OF-KIGALI-DEMO-SETUP-A-TO-Z.md` |
| **Story + in-room script** | `docs/presentations/Bank-of-Kigali-DEMO-SCENARIO.md` |
| **AI use cases + data privacy script** | `docs/presentations/Bank-of-Kigali-AI-USE-CASES.md` |
| **Speaker notes** | `docs/presentations/Salanor-Bank-of-Kigali-NOTES.md` |
| **PowerPoint** | `docs/presentations/Salanor-Bank-of-Kigali-AI-Governance-v3.pptx` |
| **Main n8n workflow** | `integrations/n8n-nodes-salanor-aegis/examples/bank-of-kigali-vendor-payment-demo.json` |
| **Optional structuring workflow** | `integrations/n8n-nodes-salanor-aegis/examples/bank-of-kigali-structuring-demo.json` |
| **Generic smoke test (backup)** | `integrations/n8n-nodes-salanor-aegis/examples/smoke-test-with-error-trigger.json` |
| **n8n setup reference** | `integrations/n8n-nodes-salanor-aegis/examples/SMOKE_TEST.md` |

---

## Q1 · New organization or use your existing one?

### Recommendation: **use your existing organization** (e.g. Salanor Ltd)

| Option | When | Why |
|--------|------|-----|
| **Existing org (recommended tonight)** | Demo tomorrow, limited time | Agent, bridge, and console already work. Fastest path. |
| **New org "BK Demo Sandbox"** | Optional if you want clean Approvals history | Extra 30–45 min setup (see Appendix A). |

**In the room, say:**

> *"This runs on our platform today. Bank of Kigali would get its **own isolated organization** — your policies, your approvers, your data boundary."*

You do **not** need a separate org to demo successfully.

---

## Q2 · Error Trigger node — do you need it?

**No.** Not for tomorrow.

| Workflow | Error Trigger? |
|----------|------------------|
| `bank-of-kigali-vendor-payment-demo.json` | **No** — happy path only |
| `bank-of-kigali-structuring-demo.json` | **No** |
| `smoke-test-with-error-trigger.json` | **Yes** — only for testing crashes/failures in development |

The BK demo is: **block → approve → complete**. Error Trigger records workflow crashes — skip it for the bank meeting.

---

## Q3 · Corporate-wide Copilot / ChatGPT monitoring — possible?

### Honest answer for Bank of Kigali

| Status | Detail |
|--------|--------|
| **Not live today** | Salanor does not sit as a proxy in front of every employee LLM prompt. |
| **Possible as architecture** | Yes — this is a known pattern (AI gateway / LLM proxy). |
| **What exists today** | Aegis at the **tool/action boundary** (SDK, LangGraph, CrewAI, n8n) + OTLP logs to SIEM for governance events. |

**If they ask:**

> *"Today we govern **actions** — when AI tries to pay, change an account, or call a sensitive API. A corporate-wide prompt gateway — scanning every Copilot or ChatGPT request — is a different layer. It is **technically feasible**: an API gateway or browser proxy that logs prompts, applies DLP, and routes tool calls through Aegis. That is on our roadmap as an enterprise deployment pattern; the core control engine you will see tomorrow is already live on actions."*

**Do not say:** "We monitor all prompts today."

**Do say:** "We stop unauthorized **actions** today; prompt-level gateway is a natural extension we can scope with your IT security team."

---

## Q4 · Structuring attack (many small payments) — covered?

**Yes — product supports `max_daily_total` (live today).**

Attack pattern: hacker sends many payments **under** the per-transaction limit (e.g. 4 × USD 950) to bypass a USD 1,000 single-transfer rule.

**Defense:** second policy — **daily total cap** (24h window).

| Policy | Rule | Limit | Action |
|--------|------|-------|--------|
| `BK · Vendor payment · per-tx limit` | Max per transaction | USD 1,000 | Require approval |
| `BK · Daily payment cap · anti-structuring` | When daily total exceeds limit | USD 3,000 / 24h | Require approval |

**In the room (30 seconds, optional after main demo):**

> *"A per-transaction limit alone is not enough — attackers split payments. Aegis also supports a **daily total** on the same tool. Four payments of USD 950 stay under one thousand each, but the fourth pushes the 24-hour total over three thousand — and the gate triggers again."*

**Optional live test:** Appendix B (only if time and prep done).

---

# PART 1 · Setup tonight (A → Z)

### Step 1 · Open console

1. Go to **https://app.salanor.com**
2. Log in as admin
3. Confirm you see your organization (e.g. **Salanor Ltd**)

---

### Step 2 · Create policies (two active)

**Console → Policies**

#### Policy A — per-transaction (main demo)

1. **Create policy**
2. **Name:** `BK · Vendor payment · per-tx limit`
3. **Tool pattern:** `app.payments.transfer`
4. **Rule type:** **Max per transaction**
5. **Max amount:** `1000` USD
6. **Decision:** **Require approval**
7. **Save → Activate**

#### Policy B — daily total (anti-structuring)

1. **Create policy**
2. **Name:** `BK · Daily payment cap · anti-structuring`
3. **Tool pattern:** `app.payments.transfer`
4. **Rule type:** **When daily total exceeds limit**
5. **Max daily amount:** `3000` USD (24h window — default)
6. **Decision:** **Require approval**
7. **Save → Activate**

**Check:** Both policies show **Active**. No draft conflicts on the same tool (console will warn if misconfigured).

---

### Step 3 · Agent + Workflow Bridge

**Console → Agents**

1. Open your demo agent (or default agent)
2. **Enable Workflow Bridge** → ON
3. Copy **Ingest API key** (shown once — save in password manager / n8n)
4. Copy **Organization ID** (from URL or agent settings)
5. Copy **Agent ID**

**BYOK note:** Bridge uses server-side signing for n8n — say this in demo. Production core banking can use BYOK.

---

### Step 4 · n8n credential

**n8n → Credentials → Add credential**

1. Type: **Salanor Aegis API** (community node must be installed)
2. **Base URL:** `https://api.salanor.com` (or your API URL)
3. **API Key:** paste ingest key from Step 3
4. Save as: `Salanor Aegis · BK Demo`

**Node install:** if missing, install `n8n-nodes-salanor-aegis` per `integrations/n8n-nodes-salanor-aegis/README.md`

---

### Step 5 · Import main workflow

1. n8n → **Workflows → Import from file**
2. File: `integrations/n8n-nodes-salanor-aegis/examples/bank-of-kigali-vendor-payment-demo.json`
3. Rename workflow: **BK Demo · Vendor payment**
4. Open workflow → edit nodes:

| Node | Set |
|------|-----|
| **Aegis · Check policy** | Organization ID, Agent ID, credential |
| **Aegis · Record execution** | Same Organization ID, Agent ID, credential |

5. **Save**

**Workflow chain (no Error Trigger):**

```
Simulate payment job (Manual Trigger)
  → Payment request context (Set: amount, vendor, PO, etc.)
  → Aegis · Check policy
  → Simulate core banking API
  → Aegis · Record execution
```

---

### Step 6 · Pre-run test (mandatory)

1. n8n → **Execute workflow**
2. Console → **Approvals** → pending request appears
3. Verify fields:
   - **USD 2,847.50**
   - Rwanda Medical Supply Ltd
   - PO-2026-8842
4. Click **Approve**
5. n8n run completes
6. Console → **Traces** → one **COMPLETED** trace
7. Console → **Approvals → History** → **APPROVED** row visible

**If this fails, fix before tomorrow.** See `SMOKE_TEST.md`.

---

### Step 7 · Optional — structuring prep (Appendix B)

Only if you want to show daily cap live.

---

### Step 8 · Optional — export sample

**Console → Exports → Create export** (last 7 days) → wait **READY**

---

### Step 9 · Backup

1. Record 2-min Loom: Approvals → Traces → block → approve
2. Copy `Salanor-Bank-of-Kigali-AI-Governance-v3.pptx` to laptop + USB
3. Phone hotspot tested

---

# PART 2 · Tomorrow in the room (presentation + demo)

### Order

| # | What | Where |
|---|------|--------|
| 1 | Slides 1–4 | `Salanor-Bank-of-Kigali-AI-Governance-v3.pptx` |
| 2 | **Data privacy script** (2 min, before console) | `Bank-of-Kigali-AI-USE-CASES.md` |
| 3 | Slides 5–9 | Same pptx |
| 4 | **Live demo** | Section below |
| 5 | Slides 10–15 + discussion | Same pptx |

---

### Live demo steps (follow exactly)

**File:** `Bank-of-Kigali-DEMO-SCENARIO.md` Section 5

| Step | Action | Say (short) |
|------|--------|-------------|
| 0 | Privacy script — **no screen yet** | "We don't store full PAN; isolated tenant; BYOK…" |
| 1 | Approvals → **History** | "USD 2,847.50 already approved — named approver, PO, trace" |
| 2 | Traces → **COMPLETED** | "Signed chain: policy → approval → execution" |
| 3 | n8n → **Execute** main workflow | "AI-assisted payment preparing… watch it stop" |
| 4 | Approvals → **Pending** → **Approve** | "Head of Payment Operations — no click, no payment" |
| 5 | Traces → same trace **COMPLETED** | "One trace ID start to finish" |
| 6 | Exports | "Audit bundle + integrity hash" |
| 7 | (Optional) Mention **daily cap** policy in Policies UI | "Split payments caught by daily total rule" |

---

# PART 3 · Scenario reference

| Field | Value |
|-------|--------|
| Amount | USD **2,847.50** |
| Vendor | Rwanda Medical Supply Ltd |
| Account | ***4821 |
| Source | BK Operations USD ****7739 |
| PO | PO-2026-8842 |
| Tool | `app.payments.transfer` |
| Per-tx limit | USD 1,000 |
| Daily cap | USD 3,000 / 24h |

---

# Appendix A · Create separate "BK Demo Sandbox" org (optional)

Only if you want a clean tenant before tomorrow:

1. Console → create/switch organization (if your account supports multi-org)
2. Repeat Part 1 Steps 2–6 in the **new** org
3. Invite yourself as admin
4. New agent + new Workflow Bridge key

**If unsure or short on time → skip. Use existing org.**

---

# Appendix B · Optional structuring demo (5 min prep)

**Workflow:** `bank-of-kigali-structuring-demo.json` (USD **950** per run)

**Prep (tonight):**

1. Import workflow, set org/agent/credential (same as main demo)
2. Run **3 times**, approve each → ~USD 2,850 daily total ingested
3. On **4th run**, daily total exceeds USD 3,000 → **blocked / requires approval** even though 950 < 1,000 per tx

**In room:**

> *"Each payment is under one thousand — but the **daily total** policy catches the pattern. This is how you defend against structuring, not just large single transfers."*

**If prep not done:** only **show Policy B** in Console and explain — still credible.

---

# Appendix C · If they ask about hackers

> *"Per-transaction limits alone are insufficient — attackers split amounts. We add **daily totals**, **require approval** on sensitive tools, **signed traces** for forensic review, and **SIEM export** for your SOC. Aegis is one layer; it works with your firewall, IAM, and fraud systems — not instead of them."*

---

# Final checklist (print this)

- [ ] Policy A active: per-tx USD 1,000 → require approval  
- [ ] Policy B active: daily USD 3,000 → require approval  
- [ ] Workflow Bridge ON, n8n credential set  
- [ ] Main workflow imported, org/agent IDs set on **both** Aegis nodes  
- [ ] Pre-run: APPROVED history + COMPLETED trace  
- [ ] Privacy script read once  
- [ ] Loom backup on phone  
- [ ] pptx v3 on laptop  
- [ ] **No Error Trigger needed**

Good luck tomorrow.
