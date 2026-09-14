# Bank of Kigali · Evening presentation · Full demo kit

**Use this file today.** Everything for a convincing demo is here.

---

## Root cause you saw (double trace) — FIXED

**What happened:** Check Policy opens **one trace** (blocked → executing after approve). Record Run was starting a **second** trace because the middle node dropped `aegis_policy`.

**Fix applied:**
1. Workflows now use a **Code node** (`Core banking · execute transfer`) that keeps `aegis_policy` + adds execution step
2. n8n node updated: Record Run **looks up open trace** by execution ID if `aegis_policy` is missing
3. Approvals page: **no flash** after Approve (optimistic remove)

**You must re-import** `bank-of-kigali-vendor-payment-demo.json` (updated).

Old **EXECUTING** traces are orphans from before the fix — ignore them or filter Status → **COMPLETED** only.

---

## n8n: Docker or cloud?

| Option | Tonight |
|--------|---------|
| **Docker (localhost)** | **Keep it** if it already works — no need to migrate hours before the meeting |
| **n8n.cloud** | Cleaner URL, no local CPU — only if you have 30 min to set up + install community node |

**Recommendation:** Stay on Docker. Close other heavy apps. Run workflow **once** before leaving.

Community node: `n8n-nodes-salanor-aegis` — if you link local fix: mount `integrations/n8n-nodes-salanor-aegis` or wait for npm 1.0.4. **Code node fix works without npm update.**

---

## Node naming — drop "Simulate"

| Old (avoid in room) | New (use now) |
|---------------------|---------------|
| Simulate payment job | **Start vendor payment** |
| Simulate core banking API | **Core banking · execute transfer** |

In the room say: *"This node represents your core banking API — in production it is your real payment connector."*

---

## Policies to create (all active together)

### Payments — `app.payments.transfer`

| Name | Rule type | Limit | Decision |
|------|-----------|-------|----------|
| `BK · Vendor payment · per-tx limit` | Max per transaction | USD 1,000 | Require approval |
| `BK · Daily payment cap · anti-structuring` | Daily total (24h) | USD 3,000 | Require approval |

### Data exfiltration — `app.data.customer_export`

| Name | Rule type | Decision |
|------|-----------|----------|
| `BK · Bulk customer export · deny` | When tool matches | **Deny** |

### Account change — `app.accounts.limit_update`

| Name | Rule type | Decision |
|------|-----------|----------|
| `BK · Account limit change · approval` | When tool matches | Require approval |

---

## Workflows (import all 4 + optional 5th)

| # | File | Amount / tool | What it proves |
|---|------|---------------|----------------|
| **1 — MAIN** | `bank-of-kigali-vendor-payment-demo.json` | USD 2,847.50 · `app.payments.transfer` | **Block → approve → complete** |
| **2** | `bank-of-kigali-routine-payment-auto-pass.json` | USD 450 · same tool | Under limit → **auto-allow**, one trace, no inbox |
| **3** | `bank-of-kigali-data-export-deny.json` | `app.data.customer_export` | **Hard deny** — AI cannot export PII |
| **4** | `bank-of-kigali-account-limit-approval.json` | `app.accounts.limit_update` | **Non-payment** risk — limit change needs approver |
| **5 — optional** | `bank-of-kigali-structuring-demo.json` | USD 950 × 4 runs | Daily cap catches split payments |

Set **org ID, agent ID, credential** on every Aegis node in every workflow.

---

## Room script (~20 min demo)

### A. Data trust (30 sec, before screen)

From `Bank-of-Kigali-AI-USE-CASES.md` — isolated tenant, masked accounts, BYOK, no training.

### B. Show Policies (1 min)

Open **Policies** — all four rules active. Say:

> *"Per-transaction limit, daily total against structuring, deny on bulk export, approval on account limits — same engine, different tools."*

### C. Main live demo (8 min)

1. **Approvals → History** — prior USD 2,847.50 approval (if exists)
2. **Traces** — filter **COMPLETED** — open latest, show policy + approval + execution
3. **n8n** → **BK Demo · Vendor payment · requires approval** → Execute
4. **Approvals → Pending** → **Approve** (stays gone now — no flash)
5. n8n completes → **one COMPLETED trace** (not two)
6. **Exports** — mention audit bundle

### D. Quick hits (pick 2 if time)

| Workflow | Say |
|----------|-----|
| **Routine USD 450** | *"Under limit — no human delay, still logged."* |
| **Data export deny** | *"AI tried bulk PII export — hard stop, FAILED trace."* |
| **Account limit** | *"Not only payments — any sensitive tool."* |
| **Structuring USD 950** | *"Four payments under USD 1,000 — daily cap fires on the fourth."* (only if pre-tested) |

### E. If they ask about Copilot / prompts

> *"Not live today. Aegis governs **actions**. Prompt gateway is feasible with your IT — we scope separately. What you saw is the layer that stops money and data leaving without approval."*

---

## Before you leave home (15 min)

- [ ] Re-import **main workflow** (updated JSON)
- [ ] Create **4 policies** (table above)
- [ ] Workflow Bridge **ON** on agent `agt_e172524c…`
- [ ] Run **main workflow once** → Approve → **one COMPLETED trace** (not EXECUTING orphan)
- [ ] Optional: run **routine $450** → no approval, one COMPLETED trace
- [ ] Optional: run **data export** → fails at Check Policy, one FAILED trace
- [ ] Console tabs: Approvals, Traces (filter COMPLETED), Policies, n8n
- [ ] pptx v3 + this file on phone

---

## Approval page behaviour

- n8n **polls every 3 seconds** — you can stay on Approvals after Approve; n8n continues without switching tabs
- If n8n seems stuck: wait 3–5 sec after Approve
- Console deploy with approval UI fix rolls out on next web-console deploy — optimistic remove is in code now

---

## Risk map (for "what else besides amounts?")

| Risk | Tool | Policy | Demo workflow |
|------|------|--------|---------------|
| Large payment | `app.payments.transfer` | Per-tx limit | **#1 main** |
| Structuring / smurfing | `app.payments.transfer` | Daily total | **#5 optional** |
| PII bulk export | `app.data.customer_export` | Deny | **#3** |
| Account limit abuse | `app.accounts.limit_update` | Require approval | **#4** |
| Routine low-value | `app.payments.transfer` | Allow under limit | **#2** |
| Copilot / every prompt | N/A | Bank LLM + DLP stack | **Honest: roadmap** |

---

## One trace per run — how to verify

After each run, **Traces** should show **+1 trace** only:

| Path | Expected status | Events (approx) |
|------|-----------------|-----------------|
| Approve path | **COMPLETED** | 4+ (start, policy, human approval, execution, close) |
| Auto-allow | **COMPLETED** | 3+ |
| Deny | **FAILED** | 2+ |

If you see **EXECUTING** + **COMPLETED** pairs again → re-import workflow, confirm Code node is present.

Good luck this evening.
