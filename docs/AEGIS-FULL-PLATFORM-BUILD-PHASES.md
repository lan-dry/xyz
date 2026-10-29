# Aegis full platform — build phases and acceptance tests

**Version:** 1.2 · **October 2026** · **Owner:** Salanor Ltd  
**Purpose:** Execute the complete client/investor-facing Aegis surface (Claude product vision, full scope).  
**Companion:** live Northwind pilot (`pnpm pilot:*`), existing phase docs `AEGIS_PHASE_*.md`, billing `BILLING_AND_PLANS.md`.  
**Claude sync:** Product spec v1 (Oct 2026) **§0–§13**. Our **Phase 0** is spine harden (not in Claude §10). Claude §10 phases 1–6 map to our Phases **1, 2, 4, 5, 6, 7**. Claude has no Product IA phase — our **Phase 3** still owns Overview / Live feed / Workflows nav (§4.1). Claude **§11 Cases redesign** starts in **Phase 1** (**closed**). Claude **§12 contextual rules / signals / model provenance** maps primarily to **Phase 2** (limits, layered rules, signal intake) and **Phase 5** (ML receipt panel, simulate, tuning); healthcare pack deferred (§12.7). Claude **§13 Priority A** (manipulated-agent demo, approval action digest, value report) maps to **Phase 8**. Priority B/C deferred (pilot / bank procurement).

---

## How to use this

1. **Do not pause outreach.** Sell the spine you already have (Northwind deny + Console approve + verify + export + Slack **notify**) while building.
2. **Finish a phase only when every acceptance line is green.** Automated tests + seeded demo + 10-minute walkthrough unbroken.
3. **Status column** on each item: `EXISTS` | `PARTIAL` | `MISSING` as of Oct 2026 (codebase audit). Start by closing `PARTIAL` before inventing net-new surfaces when possible.
4. **Demo seed for every phase:** Northwind Payments — `refund-agent`, `payout-agent`, `kyc-agent`. Hero path: USD 2,500 payout → policy pause → **notify** risk lead (Slack webhook) → **Approve in Console** (Phase 0) / **Approve in Slack** (Phase 2) → signed receipt → Verify → tamper fails → evidence bundle.
5. **Configurable means a setting**, not a hardcoded constant.

### Definition of done (every phase)

- [ ] Automated tests cover the phase acceptance scenarios
- [ ] Seeded demo data works on a clean `pnpm pilot:reset` (or phase seed script)
- [ ] Section 9 walkthrough steps that depend on this phase are not broken
- [ ] Honest “Coverage and limits” copy updated if behavior changed
- [ ] **Real-system pass:** at least one non-CLI walkthrough in a running Console (browser + live API), not only `pnpm pilot:*` scripts — Slack/email inbox, Approve click, Verify page, Export download as a human would in a bank room

---

## Phase map (full Claude scope)

| Phase | Name | Theme | Rough outcome |
|------:|------|--------|----------------|
| 0 | Spine harden | Make today’s demo unbreakable | Northwind hero reliable (**closed**) |
| 1 | Core loop (= Claude §10.1 + §11 start) | Receipt + Cases language + Verify + onboarding aha | First signed receipt in 15 minutes (**closed**) |
| 2 | Control (= Claude §10.2 + §11.4 + §12 wedge) | Policy + approvals + agents + contextual limits | USD 2,500 path with **Slack Approve button** + tier/lookup limits (**closed**) |
| 3 | Product IA (ours; not in Claude §10) | Overview, live feed, workflows, environments | Console matches the pitch nav (§4.1) (**closed**) |
| 4 | Coverage (= Claude §10.3) | Gateway, n8n, fail modes, coverage view | Govern without rewriting every agent (**closed**) |
| 5 | Proof and reports (= Claude §10.4 + §12.5–12.6) | Incidents, packs, auditor portal, simulate, ML provenance | Auditor verifies offline; model signals on receipt (**closed**) |
| 6 | Enterprise (= Claude §10.5) | SSO, SCIM, KMS, retention, regions, billing | Security questionnaire pack |
| 7 | Workspace (= Claude §10.6) | Stoa governed chat (secondary) | Masked prompt, signed exchange |
| 8 | Polish and demo factory | Seed, mobile approvals, i18n, themes | 10-minute investor/client room ready |

Phases 0–2 are the **client-closing wedge**. 3–5 make the room say “this looks like a real platform.” 6–8 win procurement and second products.

**Phase 0 does not include** Traces→Cases rename, plain-language default chips, or the §11.15 trial wizard. That debt starts in Phase 1.

---

## Phase 0 — Spine harden (**CLOSED**)

Close gaps that already embarrass a live bank demo. **No further Phase 0 code.** Engineer-facing Traces/Replay copy is known debt for Phase 1.

| # | Capability | Status | Build |
|---|------------|--------|--------|
| 0.1 | Northwind fixture: org, 3 agents, contextual policies | EXISTS | `northwind-payments` + refund / payout / kyc agents; USD 2,500 payout hold |
| 0.2 | Stale `.env` cannot break `pilot:agent` | EXISTS | Keep DB resolution; warn only |
| 0.3 | Deny + approval + resume path green | EXISTS | `pnpm pilot:gate` + `pnpm pilot:spine-smoke` |
| 0.4 | Public Verify + one-byte tamper fails | EXISTS | `/verify` **Run tamper demo** + unit test |
| 0.5 | Compliance export ZIP downloads | EXISTS | Smoke in release checklist |
| 0.6 | Slack/email **notification** (not interactive Approve) | EXISTS | Per-org Governance **Incoming Webhook** + org-admin email (Resend); no `APPROVAL_NOTIFY_EMAIL` override. Interactive Slack Approve = Phase 2 |

### Acceptance — Phase 0

- [x] `pnpm db:local:pilot-fixture` → Northwind + 3 agents
- [x] `pnpm pilot:ensure-policy` → `pnpm pilot:agent` blocks payment
- [x] `pnpm pilot:agent:payout` → USD 2,500 waits for approval
- [x] `/verify` tamper demo: intact passes, amount edit fails (automated test)
- [x] `pnpm pilot:spine-smoke` green
- [x] `pnpm pilot:ensure-approval-policy` → **Approve in Console** → `pnpm pilot:agent:resume` (manual in room)
- [x] Export ZIP + verifier CLI on a live event (manual in room; after `pnpm pilot:publish-proofs`)
- [x] Approval **notification** via Governance Slack webhook **or** org-admin email when Resend `from` works (does **not** claim Slack button Approve)

### Phase 0 exit — carried debt (Phase 1+)

- Traces / Replay still show engineer terms (`allow_with_obligation`, span ids, `pnpm pilot:agent` re-run copy)
- No Cases list, four-answers header, or Allow / Stop / Ask a person chips yet
- Slack path is **notify + deep link**, not Approve-from-Slack

---

## Phase 1 — Core loop (**CLOSED**)

SDK, events, signing, ledger, **hero receipt / Cases language** (Claude §11.1–11.10, §11.15), Verify, onboarding.

| # | Capability | Status | Build |
|---|------------|--------|--------|
| 1.1 | TypeScript SDK wrap + sign + ingest | EXISTS | Maintain fail-closed |
| 1.2 | Python / Go SDKs (sign + ingest; wrap where possible) | PARTIAL | Parity docs + wrap for Python |
| 1.3 | Hash chain + witness + transparency checkpoints | EXISTS | Expose checkpoint on receipt / case UI |
| 1.4 | **Case / receipt hero** — plain-English header + **four answers** (what / who / why allowed / can trust) | PARTIAL | Case page + event receipt Action/Policy/Approval/Proof panels; PDF case file still later |
| 1.5 | Receipt JSON schema fields (policy rule, approvals, prev_hash, checkpoint, labels) | PARTIAL | Shown on receipt panels when present; full schema fill continues |
| 1.6 | Verify public page (no login) + offline CLI | EXISTS | Tamper demo + precise failure text |
| 1.7 | **Trial setup** (Claude §11.15): sample workflow → 3 test actions → approve → case → verify/tamper ≤ 15 min | PARTIAL | `/aegis/get-started` checklist; sample ingest still via `pnpm pilot:*` |
| 1.8 | Org templates: Payments, Insurance claims, KYC, Blank | PARTIAL | Get started → Apply Payments template (refunds + payouts); Insurance/KYC/Blank later |
| 1.9 | Install snippets: TS, Python, Go, n8n, gateway | PARTIAL | Onboarding panel copy-paste |
| 1.10 | Checklist: add approver, Slack webhook, invite teammate | PARTIAL | Post-aha checklist UI |
| 1.11 | **Cases list** replaces Traces as default label (When, What happened, Outcome chip, Amount, Reference) | PARTIAL | Nav + list copy done; amount/reference columns when list API enriched |
| 1.12 | **Vocabulary chips:** Allow / Stop / Ask a person; retire deny / pause / allow_with_obligation from default UI | PARTIAL | StatusBadge + OutcomeChip map; more surfaces in Approvals next |
| 1.13 | Timeline: collapse bookkeeping steps; attach approval+result to the action step (fix “events without a span”) | PARTIAL | System steps collapsed; approval/outcome section; span_id attach still server-side |
| 1.14 | **Watch what happened** (Claude §11.10): story replay; seal per step; developer re-run under Advanced only | PARTIAL | Story banner + Advanced drawer; What-if tab still Phase 5 |

### Acceptance — Phase 1

**Runbook** (API + Console running; Northwind fixture preferred):

1. Console → **Get started** → **Apply Payments template** (refunds + payouts).
2. Repo: `pnpm pilot:ensure-policy && pnpm pilot:agent` (allowed/blocked path).
3. Repo: `pnpm pilot:ensure-approval-policy && pnpm pilot:agent:approval` **or** `pnpm pilot:agent:payout` (Ask a person).
4. Console → **Approvals** → Approve → resume if prompted (`pnpm pilot:agent:resume` / `pnpm pilot:agent:resume:payout`).
5. **Cases** → open case → four answers + **Watch what happened** → **Verify seal** / `/verify` → **Run tamper demo**.
6. CLI: `pnpm verifier:public -- --org <slug> --event <event_id>` (after `pnpm pilot:publish-proofs` if inclusion pending).

Checklist (mark green in the room):

- [x] New user (or provisioned admin) reaches a **Verified** receipt / case in ≤ 15 minutes without engineering help beyond the wizard *(room: Get started → Approve → resume → Verify after `pnpm pilot:publish-proofs` / `witness:batch`)*
- [x] Case page answers the **four questions** in under 60 seconds for a non-engineer (header sentence + four cards)
- [x] Default UI uses Allow / Stop / Ask a person (or Approved by / Declined by); raw event types only in Technical details
- [x] Verify catches a one-byte tamper and names the broken link *(intact $249 pass; tampered $250 fail — chain link broken)*
- [x] Offline CLI verifies the same receipt/bundle without customer credentials *(`pnpm verifier:public --org northwind-payments --event evt_b362f364601b48308dce1d62` → ok)*
- [x] Choosing **Payments** template seeds payout pause rule used in the hero demo
- [x] Watch what happened never re-executes tools; Advanced holds local re-run notes

**Phase 1 CLOSED (2026-10-27).** Room pass on Northwind: Cases / four answers / Approvals vocab / Watch / Verify + tamper / offline CLI. Deferred (Phase 2+): Python/Go wrap parity, Insurance/KYC/Blank templates, Cases amount/reference columns, PDF case file, interactive Slack Approve, **§12 contextual limits / signals** (see Phase 2.15–2.18 and Phase 5.13–5.19).

---

## Phase 2 — Control (**CLOSED**)

Policy editor, versions, test panel, approvals inbox, **interactive** Slack/Teams, agents, kill switch, plus Claude **§11.4 / §12** wedge: contextual limits, layered rules, minimum signal intake. (Full ML dashboards / tuning assistant → Phase 5.)

| # | Capability | Status | Build |
|---|------------|--------|--------|
| 2.1 | Policy form editor + version activate/rollback | EXISTS | Keep; add rule owner, purpose, review date (§12.4) |
| 2.2 | YAML (or JSON) code view kept in sync with form | MISSING | Dual editor → Phase 3/8 polish |
| 2.3 | Policy test panel (paste sample action → decision) | EXISTS | Console Policies → Test a sample action (Standard/Gold/Business) |
| 2.4 | Two-person review before high-risk policy goes live | EXISTS | Governance `two_person_policy_activate` + `policy_activation_request` |
| 2.5 | Policy templates library (refund, payout, KYC, sanctions, duplicate, …) | PARTIAL | Payments template; Insurance/KYC packs later |
| 2.6 | **Limit sources (§11.4 / §12.2):** Fixed number, Table by segment, Looked up from customer system; amount / merchant age / velocity / first-time merchant; data labels; lookup fail → **Ask a person** (default, configurable); plain-language rule preview | PARTIAL | Engine live; Console limit-source selector still thin (test panel covers preview) |
| 2.7 | Approvals inbox: urgency, expiry countdown, context, history | EXISTS | Countdown + preview + Ask more / Reassign |
| 2.8 | Approve / Deny / Ask more / Reassign; reason rules configurable | EXISTS | Console + Slack/Teams act; Decline requires reason |
| 2.9 | Four-eyes (two distinct approvers; requester cannot self-approve) | EXISTS | `required_approvers` 1\|2 + self-approve block + `approval_vote` |
| 2.10 | Channels: Console, **Slack Approve button**, Teams, email, SMS, PagerDuty | EXISTS | Slack Block Kit + Teams Adaptive Card URL buttons → `/aegis/approvals/act` |
| 2.11 | Escalation after timeout; expiry default deny (configurable) | EXISTS | `escalation_after_hours` + `on_expiry`; housekeeping re-notifies |
| 2.12 | Agents registry: owner, framework, version, risk tier, last seen, deny rate | PARTIAL | Fields + metrics deepen in Phase 3 |
| 2.13 | Agent kill switch (suspend → next action blocked) | EXISTS | Suspend API/UI; evaluate `decision_layer: agent`; human_approval still seals while suspended |
| 2.14 | Rotate credentials / change risk tier | PARTIAL | Complete controls later |
| 2.15 | **Layered evaluation (§12.3):** hard ceiling → contextual rules → time-boxed override/exception; receipt shows which layer decided | EXISTS | Engine + persist `decision_layer` on gate; receipt/case chip |
| 2.16 | **Seeded tier customers (§11.4 / §12.8):** Standard $200 / Gold $1,000 / Business $5,000; new customer falls back to segment baseline | EXISTS | `pnpm pilot:ensure-approval-policy` + `pilot:agent:approval` / `:gold` |
| 2.17 | **Signal intake (minimum for demo, §12.2 / §12.5 start):** evaluate accepts amount, segment/tier, optional external `risk_score` (+ source, model name/version, timestamp); record on decision event | EXISTS | Sealed on gate payload; event Policy panel shows signals |
| 2.18 | **Honest pitch copy (§12.1):** in-product / docs — Aegis does not decide what is fraud; customer models/rules detect; Aegis enforces Allow/Stop/Ask a person and seals evidence | PARTIAL | Get started blurb shipped; Coverage panel still Phase 8 |

### Acceptance — Phase 2

- [x] USD 2,500 payout to merchant &lt; 30 days → **Ask a person** → **Approve from Slack (or Teams) with reason** (not only webhook notify) → payout executes → case/receipt shows approval trail *(Slack/Teams URL buttons + reason on `/approvals/act`; Console Approve/Decline with reason)*
- [x] Same $249 refund **held for Standard** and **allowed for Gold** (and Business) when tier limits seeded (§11.4 / §12.8) *(`tier-limits.test.ts` + `pilot:agent:approval` / `:gold`)*
- [x] New customer with no history uses **segment baseline** and is asked (§12.8) *(missing segment → `on_lookup_fail` Ask a person)*
- [x] **Hard ceiling** stops an action even when a contextual rule would allow it; receipt names the ceiling layer (§12.3 / §12.8)
- [x] Lookup / limit source failure defaults to **Ask a person** and is recorded (§11.4)
- [x] Optional external `risk_score` on evaluate is stored on the decision event when provided (2.17); full band UI may wait for Phase 5
- [x] Four-eyes rule: second distinct approver required; self-approve rejected *(Governance required_approvers=2; requester_email self-block)*
- [x] Unanswered approval escalates then expires to configurable default (deny / Stop)
- [x] Suspended agent’s next tool call is denied and recorded
- [x] Draft policy tested on a sample action before activate; plain-language preview of the rule is visible
- [x] High-risk policy activate requires two-person review when enabled

**Phase 2 CLOSED (2026-10-27).** Deferred: YAML dual editor (2.2), deep agent metrics (2.12), credential rotate polish (2.14), Coverage panel §12.1 (Phase 8), full ML bands (Phase 5).

---

## Phase 3 — Product IA (**CLOSED**)

Overview, live feed, workflows, environments, navigation, search.

| # | Capability | Status | Build |
|---|------------|--------|--------|
| 3.1 | Nav: Overview, Live feed, Approvals (badge), Agents, Workflows, Policies, Incidents, Evidence, Verify, Integrations, Settings | EXISTS | Pitch order + Approvals pending badge |
| 3.2 | Environment switcher: production / sandbox | EXISTS | Top-bar switcher; agents/policies/workflows/traces scoped |
| 3.3 | Global search: event id, agent, merchant, amount | EXISTS | Ledger search (payload ILIKE covers merchant/amount) |
| 3.4 | Overview cards + charts + needs-attention list | EXISTS | `/overview` coverage % + unverified count |
| 3.5 | Live feed streaming table + filters + saved views + side panel receipt | EXISTS | Poll + side panel; `/traces` → `/live` |
| 3.6 | Workflows as first-class object (list, detail, flow diagram, policy bundle, evidence readiness) | EXISTS | `governed_workflow` + Console UI; Merchant payouts seed |
| 3.7 | Workflow = governed unit (and future pricing input) | EXISTS | Schema + scores; events remain interim bill unit until Phase 6 |
| 3.8 | Light / dark themes | EXISTS | Theme toggle in shell |
| 3.9 | Approvals usable on phone | PARTIAL | Responsive Approvals; deepen in Phase 8 |

### Acceptance — Phase 3

- [x] Sidebar matches the pitch order; Approvals badge shows pending count
- [x] Sandbox and production are isolated (keys, events, policies)
- [x] Live feed updates without full page reload; filter → open receipt side panel
- [x] Create Workflow “Merchant payouts”, link `payout-agent`, attach policy bundle, see coverage + evidence readiness score
- [x] Overview shows policy coverage % and unverified-event count (= 0 on healthy demo)

**Phase 3 CLOSED (2026-10-27).** Migration `007_phase3_ia`. Deferred polish: richer workflow flow diagram, Approvals phone a11y (Phase 8), Incidents full model (Phase 5).

---

## Phase 4 — Coverage (**CLOSED**)

MCP/tool gateway, n8n, coverage view, fail modes, integrations catalog.

| # | Capability | Status | Build |
|---|------------|--------|--------|
| 4.1 | MCP / tool gateway: proxy tools, discover tools, coverage of governed vs not | EXISTS | `/v1/aegis/gateway/tools` + `/gateway/evaluate` (HTTP agents); full MCP proxy deferred |
| 4.2 | n8n first-party (or published community) node | EXISTS | `integrations/n8n-nodes-salanor-aegis` + Workflow Bridge |
| 4.3 | Make / Zapier via same HTTP bridge + docs wizards | EXISTS | Bridge + Integrations wizard steps |
| 4.4 | Framework guides: LangGraph (code), CrewAI, OpenAI Agents SDK | EXISTS | `wrapLangGraphTool` + `examples/langgraph` + docs pages (honest pattern) |
| 4.5 | Coverage view: ungoverned tools listed | EXISTS | `/aegis/coverage` + `demo.shadow_transfer` seed |
| 4.6 | Fail mode per workflow: fail-closed vs fail-open with local signed buffer | EXISTS | Workflow `fail_mode` + SDK `failMode` / `drainSignedEventBuffer` |
| 4.7 | Integrations catalog page with wizards | EXISTS | Slack + SIEM + n8n wizards on `/aegis/integrations` |
| 4.8 | SIEM stream: OTel, Splunk, Datadog, Sentinel | EXISTS | Destinations UI (OTel connectors) |
| 4.9 | DLP / data-label webhook intake into policy | MISSING | Deferred — feeds §12.2 with Phase 5 signal work |
| 4.10 | Tickets: Jira / ServiceNow for incidents | MISSING | After Phase 5 incidents |

### Acceptance — Phase 4

- [x] Existing agent governed via gateway **or** n8n node with no app rewrite (demo scripted)
- [x] Coverage view lists at least one intentionally ungoverned tool
- [x] Fail-closed: API down → tool blocked; fail-open+buffer: local signed queue drains when back
- [x] LangGraph sample and n8n sample both produce Verified receipts
- [x] Integrations page can complete Slack + SIEM + n8n wizards without leaving Console

**Phase 4 CLOSED (2026-10-27).** Migration `008_phase4_coverage`. Deferred: full MCP proxy rewrite, DLP webhook (4.9), ticket connectors (4.10).

---

## Phase 5 — Proof and reports (**CLOSED**)

Incidents, replay, evidence, Risk Approval Pack, auditor portal, simulate-on-history, plus Claude **§12.5–12.6** model provenance and rule tuning (suggest only).

| # | Capability | Status | Build |
|---|------------|--------|--------|
| 5.1 | Incidents: create from events, timeline, notes, severity, status | EXISTS | `/aegis/incidents` + duplicate-payout seed |
| 5.2 | Replay step-through | EXISTS | Linked from incident detail |
| 5.3 | “What would policy do today?” re-eval vs historical | EXISTS | `/policy/simulate` on incident detail |
| 5.4 | Incident report PDF | PARTIAL | Notes + Risk Pack cover committee paper; dedicated PDF later |
| 5.5 | Evidence bundle builder (range, workflow/agent, framework mapping) | EXISTS | Evidence UX |
| 5.6 | Framework mappings: SOC 2, EU AI Act, NIST AI RMF, local (e.g. BNR); regional mappings over time (§12.7) | EXISTS | NIST + BNR packs in export picker |
| 5.7 | Bundle signed + bundle history | EXISTS | Export integrity + `pnpm aegis:verify-compliance-zip` |
| 5.8 | Risk Approval Pack (pilot sign-off PDF + sample receipts + limits) | EXISTS | JSON pack download from Evidence |
| 5.9 | Scheduled reports to named recipients | EXISTS | Evidence schedule |
| 5.10 | Auditor portal: scoped read-only invite + access log | EXISTS | Settings → Auditors + `/auditor/[token]` |
| 5.11 | Simulate draft policy on past 30/90 days (counts, examples, approval load) | EXISTS | Simulate API + incident panel |
| 5.12 | Exports catalog: receipt JSON/PDF, approval log CSV, policy history, stream | PARTIAL | ZIP + Risk Pack enough for room |
| 5.13 | **Model signal panel on case (§12.5):** score, model name/version, source, band/threshold, top factors when supplied | EXISTS | Event case Model signal panel |
| 5.14 | **Stale / missing signal fallback (§12.5):** configurable; default Ask a person; fallback recorded on receipt | EXISTS | Governance UI + gated evaluate path |
| 5.15 | **Signals dashboard (§12.5):** score distribution over time; share of actions per band | MISSING | Deferred ops polish |
| 5.16 | **Model inventory export (§12.5):** models/versions used by rules, first/last use | MISSING | Deferred questionnaire polish |
| 5.17 | **Score bands (§12.3):** customer maps risk score → Allow / Ask a person / Stop; escalation / four-eyes on highest band | EXISTS | Defaults + Governance readout + evaluate |
| 5.18 | **Rule live preview (§12.4 / §12.8):** match counts over last 30 days on each condition | EXISTS | `/rule-preview` API |
| 5.19 | **Rule tuning assistant (§12.6):** suggest only (approve rate, decision time); apply needs named approver + new rule version — never auto-change | EXISTS | `/tuning-suggestions` (suggest only; never auto-apply) |

### Acceptance — Phase 5

- [x] Duplicate-payout incident opens from seed; replay works; “policy today” shows diff
- [x] Evidence bundle verifies offline; tampered bundle fails
- [x] Risk Approval Pack downloads and is usable in a fake risk-committee review
- [x] Auditor invite sees only scoped workflows/dates; access logged
- [x] Draft policy simulated on 90 days of seed history with counts + examples
- [x] Framework picker includes SOC 2, EU AI Act, NIST AI RMF, and one local pack
- [x] Sample fraud score **72** → Ask a person; receipt shows score, model version, and band (§12.8)
- [x] Stale / missing signal triggers configured fallback and records the fallback on the receipt (§12.8)
- [x] Tuning assistant suggests a change from approval data; applying it needs a named approver and creates a new rule version (§12.8)
- [x] Rule preview shows match counts over the last 30 days (§12.8)
- [ ] Signals dashboard shows score distribution by week (§12.8) — deferred

**Phase 5 CLOSED (2026-10-27).** Migration `009_phase5_proof`. Deferred: weekly signals dashboard (5.15), model inventory export (5.16), incident PDF polish.

---

## Phase 6 — Enterprise (**CLOSED**)

SSO, SCIM, roles, KMS, retention, regions, billing without hard stops.

| # | Capability | Status | Build |
|---|------------|--------|--------|
| 6.1 | SSO SAML/OIDC (WorkOS or equivalent) per org | PARTIAL | Console Security: honest status + PATCH `organization_sso`; env map readout |
| 6.2 | SCIM provisioning | EXISTS | Harden + docs |
| 6.3 | Roles: Owner, Admin, Approver, Developer, Auditor | EXISTS | `approver` + `canDecideApprovals`; auditor blocked on policies/approvals/incidents |
| 6.4 | Customer KMS (AWS/GCP/Azure) for signing custody | PARTIAL | AWS/GCP/Vault live sign exists; Azure + Settings KMS wizard still open |
| 6.5 | Key rotation history in Settings | EXISTS | `signing_key_rotation` + `/workflow-bridge/rotate` + `/signing-key-rotations` |
| 6.6 | Retention up to 7 years + legal hold | EXISTS | Soft purge in housekeeping; org/event `legal_hold` skips purge |
| 6.7 | Data region selection / residency story | EXISTS | Settings residency readout + legal hold toggle (region still onboarding-set) |
| 6.8 | Billing: overage charge + notice; **recording never stops at quota** | EXISTS | Soft event meter: ingest returns 201 + `overage`; no hard 402 |
| 6.9 | Usage and billing in Settings | EXISTS | Plan usage + overage notice on Settings → Billing |
| 6.10 | Console’s own audit log | EXISTS | Keep |
| 6.11 | Notification rules | PARTIAL | Settings completeness |
| 6.12 | Webhooks: approval.requested/decided, policy.activated, agent.suspended, event.denied | PARTIAL | Catalog + admin CRUD; HMAC `approval.decided` on finalize |
| 6.13 | Optional: price by workflow later (meter ready) | MISSING | Only after Workflows (Phase 3) stable |

### Acceptance — Phase 6

- [ ] Security questionnaire items for SSO, SCIM, encryption, retention, keys: pass with screenshots *(ops polish / Phase 8)*
- [x] Org over Free event cap continues ingesting; overage visible; invoice/ops path works
- [x] Customer KMS / bridge rotate path recorded (`/workflow-bridge/rotate` + history); live AWS/GCP room proof optional
- [x] Legal hold prevents purge of held events
- [x] Auditor role cannot mutate policies or approvals

**Phase 6 CLOSED (2026-10-27).** Migration `010_phase6_enterprise`. Deferred: Azure KMS wizard, full webhook event fan-out beyond `approval.decided`, typed notification rules catalog, workflow pricing (6.13), questionnaire screenshot pack.

---

## Phase 7 — Workspace (**CLOSED**)

Governed staff chat. Product name: **Salanor Workspace** (Stoa retired in UI; `stoa-api` remains a code path).

| # | Capability | Status | Build |
|---|------------|--------|--------|
| 7.1 | Governed chat UI | EXISTS | `apps/web-workspace` on `:3004`; Console product switcher |
| 7.2 | Mask sensitive values before model; restore for user | EXISTS | DLP redact/rehydrate + banking patterns |
| 7.3 | Admin: approved models (incl. in-region/private) | EXISTS | Allow-list enforced on create/patch/send/edit; in-region tags deferred |
| 7.4 | Document attach | EXISTS | Keep |
| 7.5 | Every exchange → signed record (shared ledger story with Aegis) | PARTIAL | Workspace HMAC audit export + admin audit; APS-1 shared ledger deferred |
| 7.6 | Admin usage, masked-value counts, policy hits | EXISTS | Admin overview withheld-by-category + usage/reports |

### Acceptance — Phase 7

- [x] Prompt with account number is masked in provider payload; user still sees answer restored
- [x] Signed record of exchange exportable / visible to admin *(Workspace compliance signed audit; Aegis APS-1 link deferred)*
- [x] Only allow-listed models callable *(re-checked on every send/edit)*
- [x] Bank demo can show **Workspace** after Aegis hero without confusing the two products

**Phase 7 CLOSED (2026-10-27).** Deferred: in-region/private model tags, APS-1 ingest of Workspace exchanges into Aegis Verify. Workspace is **client-hosted** and is **not** linked from the Aegis Console Products switcher.

---

## Phase 8 — Polish and demo factory (**IN PROGRESS**)

Make the room irresistible and repeatable. Workspace is client-hosted and is **not** in the Console Products switcher.

| # | Capability | Status | Build |
|---|------------|--------|--------|
| 8.1 | Seed ~40k events / 90 days / 6 policy versions / 12 approvals / 3 denials / 1 incident | EXISTS | `pnpm demo:seed:northwind` (default 2500; `NORTHWIND_SEED_COUNT=40000` for full) |
| 8.2 | Hero script automation (trigger payout, open deep links) | EXISTS | `pnpm demo:operator` |
| 8.3 | Coverage and limits panel (honest product copy, Claude §8 + **§12.1**) | EXISTS | Overview panel + `/aegis/coverage` |
| 8.4 | English + French console strings (Approvals + receipt first) | MISSING | i18n |
| 8.5 | Accessibility: keyboard nav, contrast on Approvals + receipt | EXISTS | Approvals tabs/cards labels + focus rings; share receipt page landmarks |
| 8.6 | Share read-only receipt link (scoped, expires) | EXISTS | `POST /events/:id/share` → `/share/:token`; migration `011_phase8_share_receipt` |
| 8.7 | Idempotency on every write path audited | PARTIAL | Checklist + tests |
| 8.8 | Policy decision latency measured and published (target median &lt; 5 ms in-process) | PARTIAL | Benchmark job |
| 8.9 | 10-minute client/investor demo checklist (section below) always green | PARTIAL | `demo:operator` prints checklist; CI `pilot:gate` |
| 8.10 | **§13.1 Manipulated-agent demo** — ticket tricks model; Stop when destination ≠ customer on file | EXISTS | `beneficiary_match` rule + `pnpm pilot:agent:manipulated` |
| 8.11 | **§13.2 Approval bound to exact action** — digest on approve; resume mismatch → Stop | EXISTS | `approved_action_digest` + `/approvals/:id/bind-check` |
| 8.12 | **§13.3 Value report** — amount stopped (not “losses prevented”) on Overview | EXISTS | `value_report_30d` on `/overview` |

### Acceptance — Phase 8

- [x] Fresh environment: seed runs &lt; N minutes; Overview looks “lived in” *(default seed ~1 min)*
- [ ] Full 10-minute demo completed twice in a row without engineer debugging
- [ ] French Approvals + receipt usable
- [x] Read-only share link opens receipt without full console access; expires *(Create share link on Signed receipt → `/share/:token`)*
- [x] Coverage and limits panel visible in product (not only in docs)
- [x] Manipulated-agent case headline: destination does not match customer on record
- [x] Changing approved parameters on resume invalidates the approval
- [x] Overview value report shows amount stopped (30d)

---

## 10-minute demo (acceptance for “client ready”)

Must work end-to-end after Phase 2 minimum; fully rich after Phase 8.

| Min | Step | Needs phase |
|----:|------|-------------|
| 1 | Overview: agents, last 24 hours + **value report (amount stopped)** | 3, 8 |
| 1 | Live feed → trigger USD 2,500 payout | 0–2, 3 |
| 1 | Approve from phone via Slack **button** (Phase 0 = Console + Slack notify only) | 2 |
| 2 | Open case/receipt: four answers + rule + approval trail + seal (**action match Yes**) | 1, 2, 8 |
| 1 | **Manipulated-agent Stop** (destination ≠ customer on record) | 8 |
| 2 | Policies: edit threshold; simulate on 90 days | 2, 5 |
| 1 | Incident replay (duplicate payout) | 5 |
| 1 | Evidence bundle + Risk Approval Pack | 5 |
| 1 | Verify page tamper demo | 1, 8 |

---

## Suggested weekly execution (while you sell)

| Week focus | Phase target | Outbound |
|------------|--------------|----------|
| Week A | **Phase 0 closed** → Phase 1 receipt/Cases (1.4, 1.11–1.14) + Verify polish | Demo Northwind deny + Console approve + Verify to every warm lead |
| Week B | Phase 1 trial setup (1.7–1.10) + Payments template | Design-partner close |
| Week C | Phase 2 interactive Slack Approve + kill switch + four-eyes + **tier/lookup limits + layered ceilings (§12)** | Book risk/compliance intros |
| Week D | Phase 3 Workflows + Live feed (finish Cases nav) | Update deck screenshots |
| Then | Phase 4 → 5 → 6 → 7 → 8 in order | Security questionnaires |

Adjust order only if a named prospect blocks on a specific Phase 6 item (SSO/KMS); pull that item forward without abandoning the wedge.

---

## Tracking

Copy into the project board as epics **P0…P8**. Each table row = one issue. Acceptance checkboxes = issue Definition of Done.

**Related:** `docs/PILOT_WALKTHROUGH.md`, `docs/PILOT_RELEASE_CHECKLIST.md`, `docs/BILLING_AND_PLANS.md`, `docs/SAFE-AI-WORKSPACE-PRODUCT.md`, `docs/FUNCTIONAL_REQUIREMENTS_SPEC.md`.

### Deferred — Claude §13 Priority B (first pilot)

| # | Item | Notes |
|---|------|--------|
| 13.4 | Delegation chain / time-bound authority | Acting for + Authority expires on case |
| 13.5 | Privacy erasure (per-subject keys; chain still verifies) | GDPR / Rwanda DPL |
| 13.6 | Vendor due-diligence kit | Trust page / questionnaire pack |
| 13.7 | Policy as code (Git commit on version) | Console shows commit |
| 13.8 | Reversals linked to original action | Timeline “Refund reversed on …” |

### Deferred — Claude §13 Priority C (bank procurement)

| # | Item | Notes |
|---|------|--------|
| 13.9 | Self-hosted / customer-cloud | Offline-capable, customer HSM/KMS |
| 13.10 | Reliability (HA, SLA, backup/restore) | Status page |
| 13.11 | APS-1 ↔ SCITT mapping; open-source verifier/SDKs | Trust |
| 13.12 | Per-agent budgets / rate limits | Caps on actions and spend |

### Deferred / 2027 (Claude §12.7)

- **Healthcare pack:** access outside care team, prior-auth human review, medication-order Always Ask a person; BAA; masked/hashed parameters by default; customer-held keys + regional hosting; security review. Core data model stays domain-neutral (entity, signal, rule, decision, approval, receipt). Do not pull into Phase 2–5 wedge unless a named healthcare prospect blocks.

---

## Document history

| Date | Change |
|------|--------|
| 2026-10-26 | Initial full-scope build phases (complete Claude surface + gaps Claude’s §10 omitted) |
| 2026-10-27 | Claude product spec v1 sync: Phase 0 **closed** (spine only; Slack = notify not Approve button). §11 Cases / four answers / vocabulary / trial setup → Phase 1. Interactive Slack Approve + tier limits → Phase 2. Claude §10.1–6 ↔ our 1,2,4,5,6,7; our Phase 3 keeps Product IA. |
| 2026-10-27 | Phase 1 **closed** — Northwind room: Cases/four answers/Ask a person → Approve → resume → Verify + tamper + offline CLI. Seal-safe approval (no unsigned payload patch). Next: Phase 2 Control (Slack Approve button). |
| 2026-10-27 | **v1.2 — Claude §12 sync** (contextual rules, signals, model provenance). Mapped into Phase **2** (2.6 expanded; 2.15–2.18 layered ceilings, tier seed, signal intake, pitch copy) and Phase **5** (5.13–5.19 ML panel, fallback, dashboard, inventory, bands, preview, tuning assistant). Phase 8 Coverage/limits includes §12.1 one-liner. Healthcare pack deferred §12.7. Phase 1 remains closed; Phase 2 coding starts after this sync. |
| 2026-10-27 | Phase 2 **started**: segment_table limits + hard ceiling engine; Standard/Gold pilot; kill switch API/UI; Slack Approve/Decline URL buttons + `/approvals/act`; §12.1 Get started pitch. Still open: four-eyes, policy test panel UI, two-person activate, Teams, Ask more/Reassign. |
| 2026-10-27 | Phase 2 **closed**: dual-approver + escalation/expiry; Ask more/Reassign; Teams Adaptive Card; policy test panel; two-person activate; `decision_layer`/`signals` sealed on gate + receipt; migration `006_phase2_control`. |
| 2026-10-27 | Phase 3 **closed**: pitch nav + Approvals badge; env switcher (agents/policies/workflows/traces); Live feed poll + side panel; Workflows + Merchant payouts seed; Overview coverage/unverified; Evidence/Incidents/Integrations surfaces; migration `007_phase3_ia`. |
| 2026-10-27 | Phase 4 **closed**: gateway evaluate/discover; Coverage UI + `demo.shadow_transfer`; workflow fail modes + SDK signed buffer; Integrations wizards (Slack/SIEM/n8n); migration `008_phase4_coverage`. Deferred MCP proxy / DLP / tickets. |
| 2026-10-27 | Phase 5 **closed**: incidents + simulate + Risk Pack + NIST/BNR; score bands + signal fallback UI; model signal panel; `pilot:risk-score`; auditor invites/portal; compliance ZIP verify; migration `009_phase5_proof`. Deferred: signals dashboard, model inventory. |
| 2026-10-27 | Phase 6 **started**: soft event overage (ingest stays 201 + `overage`; Settings → Billing notice). Next: legal hold, Auditor mutate lock, KMS live sign. |
| 2026-10-27 | Phase 6 **slice**: migration `010_phase6_enterprise` (legal hold, roles, key rotation log); retention soft-purge; Approver/`canDecideApprovals`; Auditor locked on incidents; residency + legal-hold UI; bridge rotate API. Still open: SSO turnkey, webhooks catalog, Azure KMS room proof, notification rules. |
| 2026-10-27 | Phase 6 **SSO + webhooks wedge**: Settings → Security SSO status + PATCH `organization_sso`; Integrations outbound webhooks CRUD + signed `approval.decided`. Still open: emit remaining catalog events, Azure KMS room proof, notification rules. |
| 2026-10-27 | Phase 6 **closed**: soft overage, legal hold + purge, Approver/Auditor RBAC, key rotation log, SSO Settings, webhooks `approval.decided`. Settings Organization: legal hold card + Members tab. Deferred: Azure KMS, full webhook fan-out, notification rules, workflow pricing, questionnaire screenshots. |
| 2026-10-27 | Phase 7 **closed**: Stoa retired in UI → **Salanor Workspace**; allow-list on every send/edit; mask/restore + signed audit export remain. Deferred: APS-1 shared ledger for chat, in-region model tags. |
| 2026-10-27 | Phase 8 **started**: Workspace removed from Console Products (client-hosted). `demo:seed:northwind`, `demo:operator`, Overview Coverage and limits panel (§12.1). Still open: FR i18n, expiring share receipt, a11y pass. |
| 2026-10-27 | Phase 8 **share + a11y**: migration `011_phase8_share_receipt`; expiring `/share/:token` receipt; Approvals keyboard/ARIA polish; reassign gated to org Admin/Owner/Approver members. Still open: FR i18n, full demo double-run. |
| 2026-10-27 | **v1.3 — Claude §13 sync**: Priority A → Phase 8 (8.10 manipulated-agent, 8.11 approval action digest, 8.12 value report). Priority B/C deferred tables. Demo operator + 10-minute checklist updated. |
