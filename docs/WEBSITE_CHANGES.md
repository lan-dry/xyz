# Website changes (preview only — do not publish to salanor.com)

Branch: `forensic-demo-readiness`  
Status: **Awaiting founder approval of copy.** No live deploy from this branch.

## W0 — Claim audit (homepage / marketing content)

| Claim (today) | Verified against code/tests? | Required change |
|---------------|------------------------------|-----------------|
| Badge "SOC 2 · EU AI Compliance" | Mapping exists in export ZIPs; **not** a certification | Replace with "SOC 2 control mapping" + "EU AI Act Art. 12 record-keeping mapping" and visible "Mapping, not certification" |
| "<5ms SDK intercept" / policy p50 | No Phase 5 P9 benchmark published from this branch yet | Remove absolute "<5ms" until measured; show only measured figures with conditions |
| "60s Merkle witness" | Witness worker interval configurable (`WITNESS_INTERVAL_MS`); default cadence exists | Keep only if documented as configured cadence, not a guarantee |
| "SOC 2 control mapping in export ZIPs" | Present in `control-mapping.ts` / compliance export | Keep; clarify mapping not certification |
| "EU AI Act Art. 12+ mapping in exports" | Present | Keep; word as record-keeping mapping |
| "BYOK" | Partial (bridge/KMS hooks exist; full KeyProvider P1 incomplete) | Soften to "customer-controlled signing keys where configured" until P1 done |
| "OPA/WASM" | OPA WASM path exists in policy evaluate | Move to For engineers / docs; explain in plain words if kept |
| "APS-1" | Ledger format | Move off first screen; explain as "signed event format" |
| "did:agent" | Provenance / agent identity hooks | Move off first screen |
| "BYOC path for HIPAA" | Roadmap only | Roadmap section labelled as plans, not available |
| "Architecture path for FedRAMP" | Roadmap only | Roadmap section labelled as plans, not available |
| Pricing on homepage | Homepage must show no prices | Confirm homepage has no prices; Pricing page: Free + Team $299/mo + regulated custom (founder confirm) |

## W1–W8 implementation status

| Item | Status |
|------|--------|
| W1 Claims change | In progress on branch (marketing-content / home-sections) |
| W2 Homepage structure | Planned rewrite; preview only |
| W3 Jargon off first screen | Planned with W2 |
| W4 `/banks` page | Added at `apps/web-marketing/src/app/banks/page.tsx` (preview only) |
| W5 About / trust basics | Partial |
| W6 Writing style | Applies to all new copy |
| W7 Technical quality | Logo/favicon/OG — verify before preview |
| W8 Preview + this file | This document; **no live publish** |

## Before / after claim list

Will be completed when homepage copy PR is ready for founder review.
