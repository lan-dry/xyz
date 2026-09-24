# Two pitches · Do not mix them up

## Pitch A · Yassine / South Africa / new prospects

**Goal:** Make them want automation. Then sell **Salanor implements the workflow + Aegis built in**.

**Story (3 acts):**

1. **Act 1:** What automation brings (speed, scale, less manual work)
2. **Act 2:** What goes wrong without control (audit, risk committee blocks projects)
3. **Act 3:** Salanor automates one workflow on their stack and embeds Aegis from day one

**What you sell:** Implementation + Aegis platform. Not "buy our SaaS and figure it out."

| Language | File |
|----------|------|
| English (South Africa, English contacts) | `Salanor-Automation-Governance-Finance.pptx` |
| French (Yassine Francophone contacts) | `Salanor-Automation-Gouvernance.pptx` (see build script) |

**Regenerate English:**

```bash
python docs/presentations/build-automation-governance-deck.py
```

**Regenerate French:**

```bash
python docs/presentations/build-automation-governance-yassine-fr-deck.py
```

**Key line:**

> We automate your critical workflow. Aegis is built in from day one so risk and audit can trust it.

---

## Pitch B · Bank of Kigali (and similar: they already automate)

**Goal:** Add Aegis as governance layer on flows they already run or plan to run.

**Story:** Shorter. Problem = proof gap. Solution = Aegis rules + approval + trace. Demo.

| File |
|------|
| `Salanor-Bank-of-Kigali-AI-Governance-v3.pptx` |

**Key line:**

> Aegis does not replace your core. It governs sensitive actions before they execute.

---

## Wrong files (do not send for Yassine / SA outreach)

| File | Why wrong |
|------|-----------|
| `Salanor-Aegis-Governance-English.pptx` | Aegis-only, skips automation story |
| `Salanor-Aegis-Gouvernance.pptx` | Aegis-only French, skips automation story |
| BK deck | Bank of Kigali specific |

---

## Where files live after regenerate

| Audience | Path |
|----------|------|
| South Africa | `e:\salanor\Presentation\South-Africa\Salanor-Automation-Governance-Finance.pptx` |
| Yassine (English contacts) | `e:\salanor\Presentation\Yassine\Salanor-Automation-Governance-Finance.pptx` |
| Yassine (French contacts) | `e:\salanor\Presentation\Yassine\Salanor-Automation-Gouvernance.pptx` |
