# Presentation · Automation & governance for finance & insurance

**PowerPoint:** `Salanor-Automation-Governance-Finance.pptx`  
**HTML (browser / PDF):** `Salanor-Automation-Governance-Finance.html`  
**Speaker notes:** `Salanor-Automation-Governance-Finance-NOTES.md`  
**Target duration:** 25–35 minutes (including ~10 min live demo)

## Regenerate PowerPoint

```bash
python docs/presentations/build-automation-governance-deck.py
```

Requires `python-pptx` (`pip install python-pptx`).

## Open and present (HTML)

1. Double-click the HTML file (Chrome or Edge).
2. **Full screen:** `F11`
3. **Advance:** mouse wheel, `Page Down`, or arrow down (one section = one slide)

## Export PDF (to share with partners)

1. Open the HTML in Chrome
2. `Ctrl+P` → Destination **Save as PDF**
3. Layout **Landscape**
4. Enable **Background graphics**

## Live demo · bank transfer scenario

Same setup as the French governance deck — see `README-Gouvernance-Banque-Assurance.md` and `integrations/n8n-nodes-salanor-aegis/examples/SMOKE_TEST.md`.

**Key line:** same mechanics for claims, KYC, or limit changes. The pilot targets their real workflow.

## Partner handoff

If your acquaintance presents without you:

- Slides 1–11 = business case (no demo required)
- Slide 15 = Loom recording if live demo unavailable
- Do not quote custom scope beyond the pilot table — discovery with Salanor first

**Intro one-liner:**

> Landry at Salanor helps banks and insurers automate critical workflows — payments, claims, onboarding — with Aegis built in so every sensitive step has rules, approval, and an audit trail.
