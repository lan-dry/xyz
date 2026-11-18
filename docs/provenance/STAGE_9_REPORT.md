# Stage 9 report: Documentation and demo

Branch `feature/provenance`. **Not committed** (per request). `spec/` untouched.

Status: **Done, with the Partials listed below.**

## Verdict

Provenance docs, assurance ladder, customer-asserted-data definition, DEMO / runbook /
TEST_PLAN updates, and short "What Aegis proves and what it does not" copy on the case
panel, Verify page, and marketing `/banks`, `/for-engineers`, and security pages are in
place. Wording stays honest: never "verified" for content accuracy. Full end-to-end
screenshot pack and automated walk of every "Lying to Aegis" beat are **Partial**.

## Final table

| Item | Status | Tests | Evidence path |
| --- | --- | --- | --- |
| `docs/provenance/INTEGRATION.md` | Done | n/a (docs) | `docs/provenance/INTEGRATION.md` |
| `docs/provenance/SIGNING.md` | Done | conformance / SDK (prior stages) | `docs/provenance/SIGNING.md`, `conformance/vectors.json` |
| `docs/PROVENANCE.md` (adversaries, proves/does not, stages 1–9) | Done | `pnpm check:wording` (prior) | `docs/PROVENANCE.md` |
| `docs/provenance/EXECUTOR.md` (+ TS / Java / C# confirm examples) | Done | Stage 3 `decision-token` tests | `docs/provenance/EXECUTOR.md` |
| `docs/provenance/RECONCILIATION.md` | Done | Stage 4 reconciliation tests | `docs/provenance/RECONCILIATION.md` |
| `docs/provenance/COLLECTOR.md` | Done | Stage 6 collector tests (Partial live CDC) | `docs/provenance/COLLECTOR.md` |
| `docs/provenance/ASSURANCE_LADDER.md` (G0–G3 + roadmap not built) | Done | n/a | `docs/provenance/ASSURANCE_LADDER.md` |
| Case page help: "What Aegis proves and what it does not" | Done | UI typecheck | `apps/web-console/.../provenance-panel.tsx` |
| Verify page same section | Done | UI typecheck | `apps/web-console/src/app/verify/page.tsx` |
| Marketing `/banks`, `/for-engineers`, `/legal/security` | Done | n/a (static copy) | `apps/web-marketing/src/app/{banks,for-engineers,legal/security}/page.tsx` |
| Customer-asserted data definition (counsel review) | Done | n/a | `docs/provenance/CUSTOMER_ASSERTED_DATA.md` (no `contract-support/` folder) |
| `DEMO_RUNBOOK.md` "Lying to Aegis" (~8 min, 5 beats) | Done | manual present | `docs/DEMO_RUNBOOK.md` §12 |
| `docs/DEMO.md` real today vs roadmap | Done | n/a | `docs/DEMO.md` |
| `docs/TEST_PACK/TEST_PLAN.md` update | Done | n/a | `docs/TEST_PACK/TEST_PLAN.md` §E |
| `demo:runbook-walk` note / skip for Lying segment | Done | script header note | `tools/demo/demo-runbook-walk.mjs` |
| `docs/provenance/FINAL_STATUS.md` | Done | n/a | `docs/provenance/FINAL_STATUS.md` |
| Screenshot pack `docs/TEST_PACK/provenance/` | **Partial** | not captured this stage | (missing; capture after `demo:up`) |
| Automated walk of all 5 Lying beats | **Partial** | runbook-walk skips / notes only | see Partials |

## Grades each demo story reaches today

Labels are story **targets**. A live rise to G2/G3 needs confirm + reconcile / collector
match against a running stack — do not claim the grade from the card title alone.

| Story id (simulator) | Target / typical grade today | Honest note |
| --- | --- | --- |
| `loan_within_limit` | G1 at seal; **G2** after execute + reconcile | Small allow path |
| `loan_needs_manager` | G1 at seal (approver_bound); **G2** after approve + token confirm + reconcile | Large hold path |
| `loan_large_with_cdc` | Target **G3** | **Partial** — needs live Stage 6 collector |
| `loan_policy_stop` | G1 | Stop; executor must refuse |
| `source_silent_flag` | G0 / exception path | Documents `source_silent` |
| `model_override` | G1 (+ approver_bound on release) | SoD / override |
| `kyc_data_access` | G0 or G1 | Field policy masks ID |
| `loan_large_decline` | G1 | Decline path |
| `sanctions_pep_stop` | G1 | Hard stop |
| `payment_callback_unverified` | G0/G1 hold | PAY-03 |
| `escalation_time_limit` | G1 | Real 2-minute escalate |
| `delegate_*` | G1 | Delegation window |
| `unreachable_replayed` | G0/G1 flagged | Decided without Aegis |
| `wrong_key` | none (401) | No case created |
| Red Team honest limit | stays **G1** | Consistently false signed value remains labelled source claim |

## Partials / how to finish

1. **Screenshot pack** — after `pnpm demo:up` + simulator, save under
   `docs/TEST_PACK/provenance/`: provenance panel at G0/G1/G2/G3 (G3 only if collector
   live), Sources, Exceptions, refused altered execution, reconciliation report, Verify,
   PDF, Red Team panel, simulator systems panel.
2. **`demo:runbook-walk` Lying beats** — automate the five beats or keep the explicit
   SKIP note until Red Team + reconcile are driven headlessly.
3. **Live G3 in the room** — finish Stage 6 pgoutput; until then say "target G3 / Partial".
4. **Contract-support folder** — none existed; definition lives in
   `CUSTOMER_ASSERTED_DATA.md` for counsel.

## Files

Docs:
- New: `ASSURANCE_LADDER.md`, `CUSTOMER_ASSERTED_DATA.md`, `STAGE_9_REPORT.md`,
  `FINAL_STATUS.md`
- Updated: `INTEGRATION.md`, `SIGNING.md`, `EXECUTOR.md`, `RECONCILIATION.md`,
  `COLLECTOR.md`, `docs/PROVENANCE.md`, `docs/DEMO.md`, `docs/DEMO_RUNBOOK.md`,
  `docs/TEST_PACK/TEST_PLAN.md`

Console / marketing:
- `apps/web-console/src/components/console/provenance-panel.tsx`
- `apps/web-console/src/app/verify/page.tsx`
- `apps/web-marketing/src/app/banks/page.tsx`
- `apps/web-marketing/src/app/for-engineers/page.tsx`
- `apps/web-marketing/src/app/legal/security/page.tsx`

Demo tooling:
- `tools/demo/demo-runbook-walk.mjs` (Lying segment note / skip)
