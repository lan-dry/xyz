# Bank of Kigali · AI use cases · What Aegis covers (honest map)

**Read this before the meeting.** Do not claim Salanor monitors every AI prompt in the bank. That is not the product today.

---

## The honest answer to “Do I only talk about automation?”

**Talk about AI adoption at the bank — but show protection on what Aegis actually governs: sensitive actions.**

| Layer | What it is | Salanor Aegis today |
|-------|------------|---------------------|
| **AI thinking** (prompts, chat, model output) | Employee copilot, customer chatbot text | **Not fully covered** — use your LLM vendor + DLP + bank security stack |
| **AI doing** (tools, APIs, money, accounts) | Transfer, limit change, KYC decision, card block | **Core Aegis** — rules, approval, signed trace, export |
| **Proof & oversight** | Audit, BNR, board | **Aegis exports + replay** |

**Your line:**

> *"AI in a bank is not one thing. Some uses are conversation; some are **actions** that move money or change client records. Aegis protects the **action layer** — whatever triggered it: AI, automation, or a human script. That is what stops incidents and gives audit proof."*

You are **not wrong** to want broader AI security. You **would be wrong** to say Aegis already monitors every prompt and every model call inside Bank of Kigali. Be honest — they will trust you more.

---

## How AI connects to Aegis (integration pattern)

Every protected use case follows the same pattern:

```
[User / customer / staff]
        ↓
[AI or automation prepares an action]
        ↓
[Tool call: app.payments.transfer, app.accounts.limit_update, etc.]
        ↓
[Aegis · policy check]  ←── Salanor
        ↓
   Allow / Block / Require human approval
        ↓
[Core banking / CRM / card system executes]
        ↓
[Signed trace + export]
```

**Integrations that exist today:**

| Channel | How |
|---------|-----|
| n8n / Make / HTTP workflows | Workflow Bridge + Check Policy |
| Custom apps & microservices | TypeScript / Python / Go SDK |
| LangGraph agents | `wrapLangGraphTool()` |
| CrewAI agents | `governed_tool()` |
| Direct ingest | Open APS-1 signed events |

**What does NOT exist today (be clear):**

- Corporate-wide proxy that reads **every** employee ChatGPT / Copilot prompt  
- Automatic scanning of all LLM responses for hallucinations  
- Replacing your SIEM, firewall, or AML engine  

**Optional complement (live today):** OTLP logs from Aegis events → Splunk / Datadog / Sentinel (governance events, not all AI traffic).

---

## Bank of Kigali · AI use cases (full list)

### A. Customer-facing

| Use case | What AI does | Risk if ungoverned | Aegis role |
|----------|--------------|-------------------|------------|
| **Customer service chatbot** | Answers FAQs, may initiate card block or transfer | Wrong action on client account | Gate **tool calls** (block card, transfer) before execution |
| **Voice / IVR AI** | Understands intent, routes to payment or dispute | Unauthorized financial action | Same — gate actions from voice workflow |
| **Mobile app “smart assistant”** | Suggests payments, savings moves | Payment without approval | Policy on `app.payments.transfer` |
| **Personalized offers** | Marketing copy, product suggestions | Lower direct risk; PII in prompts → **data minimization**, not Aegis core | Mention partner DLP; Aegis if offer triggers account change |

### B. Operations & payments

| Use case | What AI does | Risk | Aegis role |
|----------|--------------|------|------------|
| **Vendor / treasury payments** | Reads invoice, prepares payment | **Demo use case** — USD 2,847.50 without approval | **Primary demo** |
| **Payroll / bulk disbursements** | Batch payment files | Mass wrong payouts | Threshold + approval per batch or line |
| **FX / trade ops** | Auto-hedging suggestions → execution | Large unauthorized trades | Gate execution tool |

### C. Credit & lending

| Use case | What AI does | Risk | Aegis role |
|----------|--------------|------|------------|
| **Credit scoring assist** | Model suggests approve/decline | Discrimination, wrong limit | Gate **limit assignment** or account flag changes |
| **Loan origination workflow** | Extracts docs, fills forms | Opening account without full KYC | Gate account creation / limit tools |

### D. Risk, fraud, compliance

| Use case | What AI does | Risk | Aegis role |
|----------|--------------|------|------------|
| **Fraud alert → auto-freeze** | Model flags account | Wrong freeze / wrong release | Gate **release** and **unblock** actions |
| **KYC / AML document AI** | OCR, entity match, risk score | Onboarding high-risk client | Gate account activation; approval on exceptions |
| **SAR / regulatory reporting prep** | Summarizes cases | Wrong submission timing | Gate transmission to regulator if automated |
| **Sanctions screening override** | Analyst override with AI assist | Override without authority | **Require approval** on override tool |

### E. Internal (staff)

| Use case | What AI does | Risk | Aegis role |
|----------|--------------|------|------------|
| **Internal copilot (policy, HR, IT)** | Drafts emails, searches docs | Low unless calls internal APIs | Gate when copilot calls **payment or account APIs** |
| **IT / DevOps automation** | Deploy scripts, config changes | Prod outage, data exposure | Gate prod change tools (future); today focus banking ops |
| **Document summarization (legal, audit)** | Reads contracts, reports | **Data confidentiality** — see privacy section | Minimize data sent to models; Aegis not primary |

### F. Analytics & decision support (read-only)

| Use case | AI role | Aegis role |
|----------|---------|------------|
| Management dashboards, forecasting | Read-only analytics | **None required** — no sensitive action |
| Chat with internal reports | Read-only | None unless tool calls added later |

**Summary for the room:**

> *"Wherever AI or automation **touches an action** — payment, account, KYC decision, limit, card — Aegis sits at that boundary. Read-only analytics are a different security conversation (data access, not operational control)."*

---

## Data privacy & trust (say this BEFORE the demo)

**They must trust you as an external vendor.** Use this script (~2 minutes) **before** opening app.salanor.com.

### Script

> *"Before I show the console, I want to address something critical: **your customers' data**.*
>
> *Salanor is an external company. Bank of Kigali should not hand us names, card numbers, or full account numbers to ‘make AI work.’ **You don't need to — and we don't want that for the governance layer.***
>
> *In production:*
>
> *1. **Isolated organization** — Bank of Kigali's own tenant. Other banks never see your data.*
>
> *2. **You control what is sent** — In the demo you will see **masked** accounts (`****7739`) and **business references** (PO number, vendor name). We recommend the same in production: pass what approvers need, not full PAN or national ID.*
>
> *3. **Signing keys stay with you (BYOK)** — For production integrations, your keys sign events; Salanor verifies. We don't hold your private keys.*
>
> *4. **No training on your data** — We do not use Bank of Kigali traces to train models unless you explicitly agree in writing.*
>
> *5. **What we store** — Governance metadata: rules applied, approver identity, timestamps, integrity hashes — the **audit chain**, not your core banking database.*
>
> *The demo uses a **sandbox narrative** for a vendor payment. The architecture is how we deploy for a regulated bank."*

### If they ask: “Can Salanor staff see our data?”

> *"Platform operations can support your tenant under strict access controls for incidents and support — logged and auditable. Day-to-day governance runs in **your** console with **your** admins. For a Bank of Kigali deployment we document access, retention, and export — and align with your vendor security questionnaire."*

(Honest: don't claim zero Salanor access ever — say controlled, logged, contractual.)

### If they ask: “Do you monitor all AI prompts?”

> *"Not today. Aegis governs **actions** — when an AI or workflow tries to execute a sensitive tool. For enterprise-wide prompt monitoring, you'd combine your LLM vendor controls, DLP, and network policy. Aegis is the layer that says: **this action cannot run without rule and approval** — regardless of which AI suggested it."*

---

## Presentation order (updated)

1. Title  
2. Why banks hesitate  
3. **AI use cases at BK** (this document — summary slide)  
4. AI security layers (honest stack)  
5. **Data & trust** ← **NEW — before demo**  
6. Where Aegis sits  
7. BK vendor payment scenario  
8. You keep / Aegis adds  
9. Four steps  
10. **LIVE DEMO**  
11. Human approval  
12. Audit exports  
13. Deploy on your workflow  
14. Discussion  
15. Contact  

---

## What to integrate into the deck / notes

- One slide: **8–10 use cases** with “Aegis gates the action”  
- One slide: **Data trust** (4 bullets — isolation, minimization, BYOK, no training)  
- Demo unchanged: vendor payment — but **masked accounts** in narrative  
- Remove any language about “monitoring all API requests with our keys” unless you mean **Aegis ingest keys for governed workflows only**
