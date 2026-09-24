# Platform readiness plan · Post BK + go-to-market

**Created:** March 2026  
**Goal:** Platform ready for paid deployments. Clear what ships now vs Phase 2. Start selling without over-promising.

---

## 1. What BK (and similar buyers) actually asked for

| Theme | What they said | Honest answer today | What to build |
|-------|----------------|---------------------|---------------|
| **Per-client limits** | Limits should depend on the client, not a generic amount | **Partial:** amount + `when` (segment/account) + beneficiary blocklist in engine; risk model still Phase 2 | Console UI for new conditions (Sprint 2) |
| **Systems are fine** | Why add another layer? | Aegis is not for outages. It is for **next automation/AI** with proof | Messaging only (already in decks) |
| **SI security extension** | Do you cover SI / AI security broadly? | **Yes as architecture**, separate from Aegis core. Aegis = **action boundary**. SI/DLP/prompt gateway = **their infra**, routes tool calls through Aegis | 1-page architecture doc + roadmap item (not fake product) |
| **Integration gaps** | Many things needed re-integration after demo | Demo ops: workflows, credentials, payload fields, production deploy | Re-integration checklist (below) |
| **Proof for audit** | Can we verify who approved what? | Trace, export, verify chain (with known caveats) | Fix approval signing bug; polish export UX |

---

## 2. Product architecture (keep this story consistent)

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 3 (future / separate product)                        │
│  SI security: DLP, prompt gateway, employee AI monitoring   │
│  Runs on BANK/CLIENT infra · touches PII directly           │
│  Routes sensitive TOOL CALLS → Layer 2                      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 2 · Salanor Aegis (ships today)                      │
│  Rules · block / allow / require approval · signed trace    │
│  Before payment, limit change, export, claim payout, etc.   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 1 · Client systems                                   │
│  Core banking · claims · e-commerce · n8n · APIs            │
└─────────────────────────────────────────────────────────────┘
```

**Say in sales:** "Aegis governs **actions**. Broader SI/AI security is a **separate deployment** on your side that we can design with your IT security team. We do not store your PII to run a prompt firewall."

**Reference:** `docs/presentations/BANK-OF-KIGALI-DEMO-SETUP-A-TO-Z.md` (Q3), `Bank-of-Kigali-AI-USE-CASES.md`

---

## 3. Implementation plan (prioritized)

### Sprint 0 · This week (unblock sales + BK follow-up)

| # | Task | Owner | Done when |
|---|------|-------|-----------|
| 0.1 | Send BK follow-up email (scoping call, export sample) | Landry | Email sent |
| 0.2 | Deploy latest `aegis-api` + `web-console` to production | Eng | Demo org matches what you show in room |
| 0.3 | Re-import all BK n8n workflows; fix credentials on **every** Aegis node + Error Trigger | Eng | 5 demo paths pass (`BANK-OF-KIGALI-DEMO-EVENING.md`) |
| 0.4 | Every workflow has **Request context** Set node (amount, recipient, summary, segment if available) | Eng | Approvals UI shows rich preview |
| 0.5 | Record 2-min Loom: block → approve → trace → export | Landry | Link in all outreach |
| 0.6 | LinkedIn post with screenshot (one per week minimum) | Landry | Public proof live |

### Sprint 1 · Weeks 1–2 (stability + trust)

| # | Task | Why | Status |
|---|------|-----|--------|
| 1.1 | **Fix approval payload re-sign after obligation** | Policy gate events verify correctly | **Done** — `event-resign.ts`, `approvals.ts`, `bridge.ts`, SDK `wrap-fetch.ts` |
| 1.2 | **Contextual policy `when` + beneficiary blocklist** | Segment/account/beneficiary rules in engine | **Done** — `payload-context.ts`, `evaluate-conditions.ts`, tests |
| 1.3 | Housekeeping cron for stale traces/approvals | Clean console for demos | **Done** — `maintenance/housekeeping.ts`, Railway/Fly worker; integration test |
| 1.4 | **SI security extension** 1-pager (architecture, not product mockup) | BK question, Yassine contacts | **Done** — `docs/SI-SECURITY-EXTENSION.md` |
| 1.5 | Document required APS payload fields for rich approver context | Stops "generic limit" confusion | **Done** — `docs/APS_PAYLOAD.md` (approver preview + n8n TTL note) |
| 1.6 | Phase A console QA checklist complete | No embarrassing bugs in scoping calls | Open — walk `docs/PHASE_A_CONSOLE_CHECKLIST.md` before next scoping call |

### Sprint 2 · Weeks 3–6 (BK Phase 2 = first paid differentiator)

| # | Task | Why | Approach |
|---|------|-----|----------|
| 2.1 | **Contextual policy conditions** | #1 BK objection | **Engine done** — Console UI + BK example policies remain |
| 2.2 | Console UI for new condition types | Ops can configure without code | Policies page |
| 2.3 | Example contextual policies for demos | Scoping narrative | **Done in product** — configure per org in Console (no client-specific seed in repo) |
| 2.4 | Trace-level "verify all events" or clearer verify UX | Audit question in room | Console traces page |
| 2.5 | Export sample bundle pre-generated for sales | Attach to follow-up emails | One READY export per demo org |

### Sprint 3 · Weeks 7–12 (scale + enterprise)

| # | Task | Notes |
|---|------|-------|
| 3.1 | SAML/SSO (Enterprise) | When first buyer requires it · `docs/AUTH_ROADMAP.md` |
| 3.2 | B-202 auto-detect provenance heuristics | When payload fields often missing |
| 3.3 | SIEM + Aegis joint reference architecture | For CISO conversations |
| 3.4 | SOC 2 Type I readiness (external) | `docs/COMPLIANCE_AND_ROADMAP.md` |
| 3.5 | SI gateway MVP (only if signed LOI) | API proxy sketch, not full DLP |

---

## 4. Shipped vs not (do not lie in sales)

### Ships today

- Tool + amount + daily cap rules
- **Contextual rules:** `when` (segment, account type) + blocked beneficiary list (JSON / API)
- Human approval with notifications
- Signed append-only event chain
- Console: policies, approvals, traces, exports
- n8n Workflow Bridge
- SDK (TS, Python, Go)
- SIEM OTLP export
- SOC 2 / EU AI Act control **mapping** in exports (not certification)

### Does NOT ship today (Phase 2+)

- Console UI for contextual conditions (engine accepts JSON today)
- Risk model recommending limit per client (built **with** client on their data)
- Corporate prompt gateway / Copilot DLP (separate SI product)
- Certified SOC 2 badge
- Rego/OPA visual editor (only if prospect requires in writing)

---

## 5. Go-to-market (start getting users now)

**You do not wait for Phase 2 to sell.** You sell:

> One workflow in 4–8 weeks. We implement automation. Aegis is built in. Success = your audit validates the export.

### Channels (in order)

1. **BK follow-up** + Yassine / SA decks already sent  
2. **Warm intros only** (Norrsken, Jacob, Christel-type) — no more 50 cold DMs  
3. **LinkedIn + Loom** every week  
4. **One vertical** for March: **bank payment OR insurer claim** — not both in messaging  

### Target this month

- **3 scoping calls booked** (not 3 signatures)
- **1 paid implementation** (even small: USD 2–4k setup + platform fee)

### Pricing (keep simple)

| Item | Range |
|------|-------|
| Aegis Team platform | From USD 299 / month |
| Implementation (one workflow) | USD 2,000–8,000 by complexity |
| SI extension architecture workshop | USD 1,500+ ( scoping only, not build) |

---

## 6. E-commerce · Does Aegis fit?

### Yes, but only on **sensitive actions**

| Good fit | Weak fit |
|----------|----------|
| Refund above threshold | Product recommendations |
| Payout / seller disbursement | Chatbot FAQ |
| Bulk customer export / GDPR request | Catalog updates |
| Account role change (admin, API keys) | Marketing email blasts |
| Fraud override / chargeback release | Inventory sync |

**Pattern:** money moves or regulated data leaves → Aegis gate.

### Free automation + Aegis?

**Do not lead with "free."** It attracts tire-kickers and devalues implementation.

**Better offer:**

| Option | When |
|--------|------|
| **Reduced pilot** (USD 1–2k instead of free) | They have real volume + will be a public case study |
| **14-day technical pilot** | They assign one dev + one ops person; you keep scope to **one action** (e.g. refund > X) |
| **Free discovery call only** | Always |

**Only pursue e-commerce if:**

- They already use n8n, Make, or custom APIs for ops  
- One workflow touches **money or PII export**  
- They will let you publish a **short case study** after  

**Skip e-commerce** if they only want "AI chatbot on the storefront" with no governed actions.

---

## 7. Weekly rhythm (Landry)

| Day | Focus |
|-----|-------|
| Mon | Product: one Sprint 0/1 task |
| Tue | Outreach: 2 warm messages + follow-ups |
| Wed | Loom / demo polish |
| Thu | Scoping calls |
| Fri | BK/Yassine/SA pipeline review; one follow-up nudge |

---

## 8. Related docs

| Doc | Use |
|-----|-----|
| `OUTREACH-PITCHES.md` | Which deck for which buyer |
| `BANK-OF-KIGALI-DEMO-EVENING.md` | Demo re-integration |
| `Bank-of-Kigali-AI-USE-CASES.md` | Honest AI coverage map |
| `COMPLIANCE_AND_ROADMAP.md` | Live vs roadmap |
| `docs-internal/BACKLOG.md` | B-xxx engineering tickets |

---

## 9. Decision log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| SI security | Separate product/layer, not inside Aegis v1 | PII stays on client infra; honest to BK |
| Per-client limits | Phase 2 engine work, not fake demo | BK feedback |
| E-commerce | Secondary vertical; refunds/payouts only | Same action-governance pattern |
| Free work | No; discounted pilot with case study | Protect runway and positioning |
