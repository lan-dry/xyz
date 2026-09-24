# Bank of Kigali · Exact pitch script · Slide by slide

**Deck:** `Salanor-Bank-of-Kigali-AI-Governance-v3.pptx` (15 slides)  
**Demo script:** `Bank-of-Kigali-DEMO-SCENARIO.md` Section 5  
**Use cases / Q&A:** `Bank-of-Kigali-AI-USE-CASES.md`

---

## Is 15 slides too many?

**No — for a 45–60 minute meeting, 15 slides is right.**  
Rule of thumb:

| Block | Slides | Time |
|-------|--------|------|
| Opening + AI context | 1–4 | ~8 min |
| Architecture + trust | 5–9 | ~10 min |
| **Live demo** | 10 | **~12 min** |
| Proof + close | 11–15 | ~15 min |
| Discussion | (slide 14) | ~10 min |

**If they look bored or IT is impatient:** jump from slide 4 → slide 10 (demo). Come back to slides 11–13 after.

**If you are short on time:** skip slide 7 (overlaps slide 3) and slide 9 (say “four steps” in one sentence on slide 8).

---

## One sentence to memorize (your north star)

> *"Aegis is the control layer Bank of Kigali puts in front of sensitive operations — so you can adopt AI and automation without losing accountability, approvers, or audit proof."*

---

## Honest positioning (say this once early — slide 3 or 4)

> *"I'm going to be direct with you. AI in a bank is not one product problem. Some AI is conversation — chatbots, copilots, internal assistants. Some AI is **action** — payments, account changes, KYC decisions. Salanor Aegis protects the **action layer** today: rules, human approval, signed traces, exports. We don't replace your firewall, your SIEM, or your AML engine. We make sure nothing sensitive **executes** without control and proof — whether the trigger was AI, automation, or a script."*

**If they ask about full AI protection / unicorn vision (partnership):**

> *"If Bank of Kigali wants to go deeper — corporate AI gateway, broader prompt governance, deeper model oversight — that's a roadmap we can build **with** you on top of this action layer. But what I'm showing you today is real, deployable, and what stops the incidents that keep boards awake at night."*

Do **not** say you already monitor every Copilot prompt. Do **not** say SOC 2 certified.

---

# SLIDE-BY-SLIDE PITCH (exact words)

---

## Slide 1 · Title · ~1 min

**Show:** Governed AI & automation for banking operations

**Say:**

> *"Thank you for making time today. I'm Landry Bougang Fotso, founder of Salanor, based here in Kigali.*
>
> *Bank of Kigali has been right to move carefully on AI. The question isn't whether AI will touch banking operations — it already is. The question is: **how do you adopt it without losing control, accountability, and proof for audit and supervision?***
>
> *Today I'll share how we think about AI security honestly — where Salanor fits — and then I'll show you a **live** example: a vendor payment that should not move money without a named approver."*

**Do not** open the laptop yet. Eye contact first.

---

## Slide 2 · Why banks hesitate · ~2 min

**Say:**

> *"Let me start by validating what your teams already feel.*
>
> *When AI or automation touches payments, accounts, or client data, a mistake doesn't move at human speed — it moves at machine speed.*
>
> *Regulators and your board will ask two questions: **who authorized this**, and **can you prove it?** Email threads and chat logs are not enough for internal audit or BNR supervision.*
>
> *One bad incident can freeze every AI project in the bank for years. So teams block automation — not because they don't want efficiency, but because nobody wants to sign without evidence.*
>
> *Your caution is correct. The real question is not 'should we use AI?' — it's **how do we use it safely?**"*

**Pause.** Let someone nod.

---

## Slide 3 · AI at Bank of Kigali · ~3 min

**This is your “I understand your bank” slide. Don't rush it.**

**Say:**

> *"At Bank of Kigali, AI and automation show up in many places — and they share one pattern when things go wrong.*
>
> *Customer chatbot or voice AI that can block a card or initiate a transfer.*
>
> *Vendor and treasury payments — like what we'll demo today.*
>
> *KYC and AML AI that recommends account activation or compliance overrides.*
>
> *Fraud alerts that auto-freeze or release accounts.*
>
> *Credit and lending AI that assigns limits or flags accounts.*
>
> *Internal copilots that help staff prepare payments or limit changes.*
>
> *In every case, the risk isn't the model having a conversation — it's the **action** that hits core banking or client records.*
>
> *Aegis doesn't read every employee prompt. It governs **actions** — whatever triggered them: AI, automation, or script. One protection pattern for all of these."*

**Optional — point at one row:** *"Which of these is closest to a workflow you're already exploring?"* (Listen 30 sec.)

---

## Slide 4 · AI security is layered · ~2 min

**Say:**

> *"No honest vendor covers all of AI security in one box. It's layered.*
>
> *Layer one: **infrastructure and data** — network, IAM, encryption, DLP. That's your security team and existing vendors.*
>
> *Layer two: **models and prompts** — vendor choice, testing, prompt safety. That's MLOps and your AI platform partners.*
>
> *Layer three: **actions and operations** — rules, human approval, signed traces, audit exports. **That's Salanor Aegis.***
>
> *Layer four: **oversight** — policies, board reporting, regulatory evidence. Compliance plus what Aegis exports.*
>
> *We are the operational control plane: **nothing sensitive moves without rules, approval when required, and proof afterward.***
>
> *If you want full-stack AI governance long term, Aegis is the foundation at the action boundary — and we can extend upward with you. What I'm demoing today is the layer that stops payment and account incidents."*

---

## Slide 5 · Your data · Our role · ~2 min

**Say BEFORE opening app.salanor.com (important for trust):**

> *"Before I show the console — because we're an external vendor and you handle sensitive data.*
>
> *In production, Bank of Kigali gets an **isolated tenant** — no cross-bank visibility.*
>
> *We practice **data minimization**: masked account references in traces, not full PAN or card numbers.*
>
> *In production, **keys stay with you** — bring your own key; Salanor verifies signatures, we don't hold your private keys.*
>
> *We do **not** train on your data unless explicitly agreed in writing.*
>
> *What we store is **governance metadata**: rules, approvers, timestamps, and the signed audit chain.*
>
> *Today's demo uses purchase order references and masked accounts — the same pattern we recommend in production."*

---

## Slide 6 · Where Aegis sits · ~1.5 min

**Say:**

> *"So where does Aegis sit in your architecture?*
>
> *Before money, accounts, or client records change.*
>
> *Customer-facing AI suggests an action → Aegis evaluates rules → a human approves if your policy requires it.*
>
> *Internal copilot prepares a transfer or limit change → same gate before execution.*
>
> *Automated KYC or onboarding workflow → exceptions stay blocked until a named person signs.*
>
> *Any API, script, or orchestrator touching sensitive operations → **one accountability chain.***
>
> *Aegis does not judge whether the model's text was polite or accurate. It governs **operations**. AI proposes, rules decide, humans authorize when needed, proof remains."*

---

## Slide 7 · Bank of Kigali · Where protection applies · ~1 min

**⚡ SKIP THIS SLIDE if short on time** (repeats slide 3 in BK-specific language)

**Say:**

> *"Concretely for Bank of Kigali: vendor payments above threshold, KYC exceptions, account and limit changes with dual control, AI-assisted channels before any financial action, and any automation touching money or client records.*
>
> *Today's demo is the vendor payment case — USD 2,847.50, procurement, PO-2026-8842."*

---

## Slide 8 · Your stack · You keep / Aegis adds · ~1.5 min

**Say:**

> *"You keep everything you've already invested in: core banking, channels, SIEM, AML, AI model vendors, existing governance.*
>
> *Aegis adds what the AI era exposed as a gap: **rules before execution**, **named human approval**, a **signed register**, and **exports** your audit and risk teams can actually use.*
>
> *We're not core banking. We're not SIEM. We're the complementary control layer for when AI and automation start calling operational APIs."*

---

## Slide 9 · How it works · Four steps · ~1 min

**⚡ SKIP if rushed — one sentence:**

> *"Connect via API or workflow bridge, apply rules, record and sign every step, replay and export for audit."*

**Full version:**

> *"Four steps. Connect — API, SDK, n8n, or open ingest. Apply rules — allow, block, or require approval. Record and sign — append-only ledger with witness batches. Replay and export — console review, integrity hash, audit bundle.*
>
> *I'll show you all four in the demo."*

**→ Advance to slide 10. Switch to browser tabs.**

---

## Slide 10 · Live demo · ~12 min

**Show slide 10 for 30 seconds, then leave it on screen or go full-screen browser.**

**Opening line (memorize):**

> *"An AI-assisted procurement workflow prepares a vendor payment. Amount **USD 2,847.50** to **Rwanda Medical Supply Ltd**, purchase order **PO-2026-8842**, from BK Operations USD account.*
>
> *Your rule: anything above **USD 1,000** requires **Head of Payment Operations** to approve before core banking executes.*
>
> *Without Aegis, that transfer goes immediately. With Aegis, it stops until an authorized person approves — and you keep the proof."*

**Before n8n:**

> *"This demo uses our workflow bridge. On your production APIs, the same rules apply; signing keys can stay with Bank of Kigali."*

**Then follow `Bank-of-Kigali-DEMO-SCENARIO.md` Section 5 exactly:**

1. Approvals **History** (2 min) — show prior APPROVED request  
2. Traces **COMPLETED** (2 min) — replay policy → approval → execution  
3. n8n **Execute workflow** (3 min) — show block / pending  
4. **Approve live** (2 min) — keep n8n tab visible  
5. Trace **COMPLETED** (1 min) — same trace ID  
6. **Exports** (2 min) — hash + SOC 2 / EU AI Act mapping (honest: for *your* audit)

**Close demo:**

> *"Same mechanism for a limit change, a KYC exception, or any AI-initiated action that touches money or client data. **Aegis is how Bank of Kigali adopts AI without betting the institution on blind automation.**"*

---

## Slide 11 · Human approval · ~2 min

**Return to slides after demo.**

**Say:**

> *"What you just saw isn't a notification — it's **governance**.*
>
> *Alerts go to email, Slack, PagerDuty, or SMS — your configuration.*
>
> *The approver is identified, timestamped, linked to **one trace** — not scattered across five systems.*
>
> *Refusal or timeout means the action **does not execute**.*
>
> *History shows approved, refused, expired — with the exact rule that applied.*
>
> *This is what risk and internal audit need when AI-era operations move at machine speed."*

---

## Slide 12 · Audit & compliance · ~2 min

**Say:**

> *"For your compliance team: export bundles by period with a verifiable integrity hash.*
>
> *Today's exports include **SOC 2** and **EU AI Act** control mappings — documentation aids for **your** audit, not a claim that Salanor is certified. Roadmap includes NIST AI RMF and ISO 42001 mappings.*
>
> *Step-by-step replay in the console — rule, approval, execution.*
>
> *Admin audit log for policies, keys, connections, exports.*
>
> *This supports BNR supervision and Rwanda Law 058/2021 accountability for processing.*
>
> *I'll be direct: Salanor is **not** SOC 2 certified today. What we give you is **operational proof** your board and regulator can validate — not a badge on our website."*

---

## Slide 13 · Deploy on your workflow · ~2 min

**Say:**

> *"We're not asking Bank of Kigali to be a design partner or help us refine a roadmap slide.*
>
> *We deploy Aegis on **one** of your critical workflows — vendor payments, KYC exceptions, whatever you choose.*
>
> *You get rules, approvers, signed register, training, and audit export on that flow.*
>
> *It runs in **your isolated organization** — your approvers, your policies.*
>
> *Typically four to eight weeks to wire one production-critical path.*
>
> *Success means **your** risk or audit team validates the trace and export **without us in the room**.*
>
> *If the partnership goes further — broader AI gateway, deeper model governance — we build that on this foundation. But we start with proof on one workflow you already care about."*

---

## Slide 14 · Discussion · ~10 min

**Say:**

> *"I'd like to hear from you.*
>
> *Which payment, KYC, or AI-initiated workflow keeps risk awake at night?*
>
> *Who must approve high-value outbound transfers today — and how is that proven?*
>
> *Who from payment ops, risk, compliance, and IT security would own a decision like this?*
>
> *What would convince you the control layer works on a **real** Bank of Kigali flow?"*

**Listen. Take notes. Write one workflow name on your notepad.**

**If interest:**

> *"Can we book a scoping call next week with payment ops, risk, and IT — I'll send a one-pager and the export sample from today."*

**Get names and a date before you leave.**

---

## Slide 15 · Contact · ~1 min

**Say:**

> *"Thank you for your time and for taking AI governance seriously — that's exactly the posture that lets banks move faster safely.*
>
> *I'm Landry Bougang Fotso, Salanor Ltd, Kigali. You'll find us at salanor.com and app.salanor.com.*
>
> *I'll send you a PDF of this deck and a summary of what we demoed. If there's interest, let's schedule that scoping session while we're all here.*
>
> *Questions?"*

---

# QUICK REFERENCE

## Demo facts (memorize)

| | |
|--|--|
| Amount | USD **2,847.50** |
| Vendor | Rwanda Medical Supply Ltd · Acct ***4821 |
| PO | **PO-2026-8842** |
| Source | BK Operations USD · ****7739 |
| Rule | Above USD **1,000** → approval |
| Tool | `app.payments.transfer` |

## What NOT to say

- "Design partner" / "help us build the product"  
- "We're not finished yet"  
- "Certified SOC 2"  
- "We secure all AI" / "We read every Copilot prompt"  

## What TO say if they want more than automation

> *"Today's demo is automation and AI-assisted operations — because that's where money moves. The same gate applies to chatbots, copilots, and internal AI tools the moment they call a payment or account API. Broader prompt-level governance is on our roadmap; the action layer is what ships and what stops incidents."*

## Tonight · rehearsal (90 min)

1. Read this script **out loud** once (45 min)  
2. Run demo per `Bank-of-Kigali-DEMO-SCENARIO.md` (30 min)  
3. Read slides 1–4 + 10 opening + 13–15 again (15 min)  

Good luck. You built something real.
