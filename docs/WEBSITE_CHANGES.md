# Website changes (preview only — do not publish to salanor.com)

Branch: `forensic-demo-readiness`  
Status: **Awaiting founder approval of copy.** No live deploy from this branch.

## W0 — Claim audit (homepage / marketing content)

| Claim | Status on branch |
|-------|------------------|
| `<5ms` SDK intercept | **Removed** from hero visual → `wrapFetch` |
| Unqualified `BYOK` | **Softened** → “your keys” / “Customer-controlled signing where configured” |
| `SOC 2 · EU AI` hero | **Replaced** → `control mapping` |
| `60s` as guarantee | **Softened** → “batched” / “Default 60s (configurable)” |
| Trace “milliseconds” / `<1s` | **Removed** → “Interactive” |
| FedRAMP / HIPAA as available | Remain roadmap-labelled |
| Pricing on homepage | No prices on homepage |

## W1–W8 implementation status

| Item | Status |
|------|--------|
| W1 Claims change | **Done** on preview (hero-data-visual, marketing-content, trust, security) |
| W2 Homepage structure | **Done** on preview — brand-first hero (Aegis by Salanor), one headline, one subhead, CTA pair, full-bleed visual |
| W3 Jargon off first screen | **Done** — no APS-1 / BYOK / OPA / &lt;5ms on hero nodes |
| W4 `/banks` page | Present (preview only) |
| W5 About / trust basics | Partial |
| W6 Writing style | Applied |
| W7 Technical quality | Verify before publish |
| W8 Preview + this file | **No live publish** |

## Preview copy (hero — do not publish)

**Brand:** Aegis by Salanor  

**Headline:** Know what your automated systems did,  
**Accent:** and who approved it.  

**Subhead:** Aegis checks sensitive actions against your rules before they run, asks a named person to approve when needed, and keeps a signed record you can show an auditor.  

**Primary CTA:** Talk to us  
**Secondary CTA:** See a short example  

**Visual node labels (honest):** wrapFetch · allow · hold · stop · your keys · append-only · batched · control mapping  

**Caption:** Rule → record → proof  

## Before / after (applied on branch)

| Before | After |
|--------|-------|
| `<5ms` | `wrapFetch` / “Measured” (bench only) |
| `BYOK` | “your keys” / customer-controlled where configured |
| `SOC 2 · EU AI` | control mapping (mapping, not certification) |
| `60s` guarantee | Default cadence / configurable |
| Trace ms SLA | Interactive reconstruction |

**Do not publish.**

## Preview copy (W2/W3 — founder review)

### Hero

- Brand line: **Aegis by Salanor**
- Headline: **Aegis** / *Verifiable decisions for automated actions.*
- Subhead: Check sensitive actions against your rules before they run, ask a named person when needed, and keep a signed record you can show an auditor.
- Primary CTA: Talk to us · Secondary: See a short example
- Visual: Policy check → Rules → Signed record (customer keys*) → Hash chain → Witness (configurable) → Export mapping (not certification)

### Claim corrections on branch

| Unsupported | Honest |
|-------------|--------|
| `<5ms` | Measured / before action (no absolute ms) |
| Unqualified BYOK | Customer-controlled signing keys where configured |
| SOC 2 · EU AI badge | Mapping, not certification |
| Milliseconds SLA | Interactive reconstruction |
| 60s guarantee | Default configurable cadence |

**Do not publish to salanor.com.**
