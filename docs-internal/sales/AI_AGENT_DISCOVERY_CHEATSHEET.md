# AI agent governance — founder discovery cheat sheet

**Use:** First calls with security, compliance, platform, or line-of-business buyers evaluating agentic AI in production.  
**Goal:** Learn whether they need **observe**, **govern**, or **prove** (usually all three; one is urgent).  
**Not:** A product pitch sheet — language mirrors how enterprises phrase RFPs and security reviews today.

---

## 30-second opener

> “When your agents can **act** (APIs, data, money), teams usually need three things: **see** every step, **stop** what policy forbids, and **prove** what happened later. Which of those is burning for you this quarter?”

---

## Three buckets (clarify in minute 1)

| Bucket | Buyer words | You hear | If missing, they feel |
|--------|-------------|----------|------------------------|
| **Observe** | tracing, LLM monitoring, SIEM, dashboards | “We can’t debug multi-step runs” | Blind during incidents |
| **Govern** | guardrails, allowlist, HITL, deny-by-default | “We can’t block before it happens” | Fear of autonomous action |
| **Prove** | audit trail, export, retention, non-repudiation | “Legal/audit asked for evidence” | Can’t defend after the fact |

**Fork:** Observe → ops/platform lead. Govern → CISO/AppSec. Prove → compliance/legal/GRC.

---

## Discovery questions (pick 6–8 per call)

### Context

1. What **production** agents exist today (not pilots)? Who owns them?
2. Which **tools/APIs** can they call (read vs write vs money movement)?
3. What is the **one action** that must never run without a human?

### Pain

4. Last surprise or near-miss — what **evidence** did you have within 30 minutes?
5. Who must **understand** a run without reading JSON (legal, audit, business)?
6. Any **deadline**: audit, customer DDQ, insurer, EU AI Act program, board ask?

### Stack

7. Build path today: direct API keys in app, framework (LangChain, etc.), MCP, internal platform?
8. What do you already use for **LLM observability** (Langfuse, LangSmith, Datadog, homegrown)?
9. Where should enforcement live: **in the agent path** (proxy/SDK) vs **batch** (SIEM only)?

### Buying process

10. Who signs: security, platform, product, procurement?
11. Success in 90 days — one sentence we could verify together?

---

## Maturity signals (where they are → what they crave first)

| They say | Stage | Crave first |
|----------|-------|-------------|
| “Copilot pilot, one team” | Experiment | Observe |
| “Reads CRM / tickets / docs” | Data exposure | Govern + data handling |
| “Creates tickets, sends email, calls APIs” | Write access | **Block + approve** |
| “Customer-facing or payments” | Regulatory | **Prove + policy linkage** |
| “Dozens of agents, no central view” | Sprawl | Platform + identity |

---

## Stakeholder phrasebook (same need, different words)

| Role | Phrases | “Understandable” means |
|------|---------|-------------------------|
| CISO / AppSec | blast radius, tool sprawl, shadow AI | Allow/deny, identity, no silent exfil |
| Compliance / Legal | accountability, human oversight | Named approver, policy version, export |
| Internal audit | sample testing, control effectiveness | Sample traces ↔ policy |
| Risk / Insurance | loss control, cryptographic proof | Deny rate, approvals, anomaly signals |
| Engineering | debuggability, repro | Trace, tool I/O (redacted), errors |
| Business owner | trust with customers | Plain English: “blocked because rule X” |

---

## RFP / security-review keywords (they’re asking for…)

| They write | They want |
|------------|-----------|
| Centralized logging / OTel / SIEM | Observe |
| Correlation across steps | Observe |
| Tool allowlist / deny-by-default | Govern |
| Human approval above threshold | Govern |
| Policy versioning / change control | Govern + Prove |
| Tamper-evident / append-only / signed records | Prove |
| Export for external audit / retention N years | Prove |
| PII redaction in logs | Observe + compliance |

---

## Red flags (deal risk or education needed)

| Red flag | Likely issue |
|----------|----------------|
| “We only need chat analytics” | No write-access pain yet — nurture or narrow ICP |
| “Legal wrote a policy PDF” | No runtime enforcement |
| “We log everything” | Unstructured ≠ decision record |
| “We’ll bolt governance on later” | Agents already in prod — urgency for govern |
| “Developers will bypass any proxy” | Need standard path + keys + policy |
| “One vendor for observability is enough” | Observe ≠ block ≠ audit-grade narrative |
| No named owner for agent risk | Project stalls — find executive sponsor |

---

## Objection → reframe

| Objection | Reframe |
|-----------|---------|
| “We have Datadog / Langfuse” | Great for **debug**; does it **block** and tie each action to **policy version** for audit? |
| “Adds latency” | Measure p99 on proxy path; compare to cost of one incident |
| “Too early for agents” | Who is piloting with API keys today? (shadow AI) |

---

## Qualification (fit vs nurture)

**Strong fit signals**

- Agent(s) in **prod** with **write** tools or sensitive data  
- Security/compliance **asked for evidence** or block-before-call  
- Willing to put control in **runtime path** (SDK/proxy), not slides only  

**Nurture**

- Summarization-only internal copilot, no tools, no regulatory pressure  
- No executive sponsor; “interesting for 2027”

---

## Close the call (next step)

| Outcome | Ask |
|---------|-----|
| Qualified | “Send one real trace (redacted) of a run you’re worried about — we’ll map observe/govern/prove gaps.” |
| Technical | “Intro platform lead + security for 45m architecture review.” |
| Early | “When first agent gets write access, reconnect — here’s this checklist.” |

---

## One-liner to leave behind

> **Enterprises don’t lack logs; they lack a single, policy-aware story of what an agent did, whether it was allowed, and proof they can hand to someone who isn’t in the IDE.**

---

## Related in-repo docs

- Implementation stages: [`../IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md)  
- Event / audit shape: [`../aps/APS-1-draft-0.1.md`](../aps/APS-1-draft-0.1.md)  
- P0 auth (console vs ingest): [`../adr/0003-p0-console-authentication.md`](../adr/0003-p0-console-authentication.md)

---

*Version 1.0 — 2026-05-21 — internal only*
