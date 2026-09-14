# Bank of Kigali · Meeting tomorrow · Tonight checklist

**Deck:** `Salanor-Bank-of-Kigali-AI-Governance.pptx`  
**Speaker notes:** `Salanor-Bank-of-Kigali-NOTES.md`  
**Regenerate deck:** `python docs/presentations/build-bank-of-kigali-deck.py`

---

## Your honest story (memorize this)

> *"Bank of Kigali is right to be careful about AI. The risk is not only the model — it is an action that moves money without a rule, a named approver, and proof. Salanor Aegis is the **protection layer** you deploy in front of those actions. We are not asking you to help us build a product. We are showing you control and evidence you can run on your own workflows."*

**Master setup (A→Z):** `BANK-OF-KIGALI-DEMO-SETUP-A-TO-Z.md`  
**Full demo scenario + room script:** `Bank-of-Kigali-DEMO-SCENARIO.md`  
**Workflow file:** `integrations/n8n-nodes-salanor-aegis/examples/bank-of-kigali-vendor-payment-demo.json`

---

## Meeting flow (~45–60 min)

| Time | What |
|------|------|
| 0–5 min | Slide 1–2: thank them, validate their caution |
| 5–12 min | Slides 3–6: AI security layers (honest), where Aegis fits, BK use cases |
| 12–25 min | **Live demo** (slide 8) — this wins or loses the room |
| 25–35 min | Slides 9–10: approval + audit |
| 35–45 min | Pilot + discussion — listen, take names |
| Last 5 min | Contact — book scoping call before you leave |

**Rule:** If they look bored during slides, jump to demo early. If IT is in the room, spend more time on layers slide + BYOK.

---

## Demo setup (do tonight, twice)

**Scenario:** AI-assisted vendor payment · **USD 2,847.50** · Rwanda Medical Supply Ltd · **PO-2026-8842**

1. **Console** → Policies → two active on `app.payments.transfer`: per-tx USD 1,000 + daily USD 3,000 (see `BANK-OF-KIGALI-DEMO-SETUP-A-TO-Z.md`)
2. **Console** → Agents → **Workflow Bridge ON**
3. **n8n** → import `bank-of-kigali-vendor-payment-demo.json` → set org ID, agent ID, credentials
4. **Run once** → APPROVED history + COMPLETED trace
5. **In room:** follow `Bank-of-Kigali-DEMO-SCENARIO.md` Section 5

**Say before showing screen:**

> *"This demo uses our orchestration bridge. On your production APIs, the same rules apply; signing keys can stay with Bank of Kigali."*

---

## What to bring

- [ ] Laptop charged + charger
- [ ] Phone hotspot tested
- [ ] `Salanor-Bank-of-Kigali-AI-Governance.pptx` on laptop (and USB copy)
- [ ] Speaker notes printed or on phone
- [ ] Business card / email ready
- [ ] Notebook — write their pilot workflow name on page 1

---

## Questions they may ask (short answers)

**"Do you secure our AI models / chatbots?"**  
*Infrastructure and model safety stay with your vendors and security team. Aegis governs **actions**: payments, account changes, anything sensitive that an AI or workflow tries to execute.*

**"Are you certified SOC 2 / BNR approved?"**  
*Not certified today. We provide signed traces and export bundles with SOC 2 and EU AI Act control mappings — material for **your** audit, not a badge on our wall.*

**"Why should we trust a young company?"**  
*We deploy on one workflow with measurable proof. Your audit team validates the control — not a slide deck. Low exposure, high clarity.*

**"We need full AI security."**  
*Agreed — that is a stack. Aegis is the operational control layer when AI or automation touches money and client data. We integrate with your existing security and core systems.*

**"Can you monitor every Copilot / ChatGPT prompt?"**  
*Not live today — we govern **actions** at the tool boundary. A corporate AI gateway is technically feasible and on our roadmap; full answer in `BANK-OF-KIGALI-DEMO-SETUP-A-TO-Z.md` Q3.*

---

## Before you walk in

- Silence phone  
- Open console tab logged in  
- Open n8n tab  
- Close unrelated tabs  
- Breathe — you built something real. The demo is production, not slides.

Good luck. You are ready if the demo works.
