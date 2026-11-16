# Production test pack — company-user path

Do these steps **in order** on the hosted stack (or a production-shaped local stack).  
Expected wording and numbers: [EXPECTED_RESULTS.md](./EXPECTED_RESULTS.md).  
Files to download and how to verify them: [DOWNLOADS.md](./DOWNLOADS.md).  
Screenshots to send back: [SCREENSHOT_CHECKLIST.md](./SCREENSHOT_CHECKLIST.md).

Standing rules: use a **dedicated** Demo Bank or `is_test` tenant for soak; never wipe a customer org. Simulator ingest key stays **server-side** only.

---

## A. Platform admin — new tenant from scratch

| # | You do | Expected | Where to look |
|---|--------|----------|---------------|
| A1 | Sign in as platform admin | Console / platform tools available | Platform or ID admin surface |
| A2 | Create organisation (name + slug for the pilot test tenant) | Org exists; slug unique | Org switcher |
| A3 | Invite first org admin by **real email** | Invitation email arrives; accept link works | Invitee inbox + accept page |
| A4 | Org admin sets password / completes onboarding | Member list shows admin; onboarding complete | **Members** / Settings |
| A5 | Invite officer + manager (and optional delegate / head) | Invites accepted; bank roles assigned if Demo Bank pack applied | **Members**, **Delegations** prep |
| A6 | Confirm / activate rules pack (or create minimum hold/allow rules) | Active policy version visible | **Rules** |
| A7 | Create ingest API key; copy secret **once** | Key listed (prefix only after leave) | **API keys** |
| A8 | Open standalone simulator; open **Setup**; paste API base, org id, agent, ingest key; save | Status: `Connected to <org> · <agent>`; key never shown again | Simulator Setup + status line |
| A9 | Run story **Loan within officer limit** (or equivalent allow) | Outcome **Allowed**; case appears | Simulator + console **Live feed** / **Cases** |
| A10 | Open case → four answers + **Verify now** + download evidence bundle | Checks pass or amber pending witness; bundle downloads | Case detail |

---

## B. Full runbook (Demo Bank or pilot test tenant)

Use Demo Bank when presenting; use smoke/`is_test` when soak-testing.

| # | You do | Expected | Where |
|---|--------|----------|-------|
| B1 | Open clean console; sign in as admin | Demo org tag if `is_demo`; Approvals badge **0** if queue empty | Overview / Live |
| B2 | Simulator: allow within officer limit | **Allowed**; case opens with four answers | Simulator + Cases |
| B3 | Simulator: hold (high amount) | **Held**; Approvals badge increments | Approvals |
| B4 | Officer session cannot approve | Plain refusal / cannot approve copy | Approvals as officer |
| B5 | Manager approves with reason | Case released; timeline names approver | Approvals + case |
| B6 | Live **v4 dual-publish** on Rules (do not pre-seed v4) | v4 live; prior case still cites v3 | **Rules** |
| B7 | Delegation: grant role; run inside/outside window stories | Inside approvable by deputy; outside not | **Delegations** + Simulator |
| B8 | Escalation story; wait **2 real minutes** | Escalates to higher role | Approvals |
| B9 | Hard-stop release (reason code / callback as required) | Released only with required fields | Approvals |
| B10 | Record-only story if available | Recorded without block | Cases |
| B11 | **Reports**: preview + download CSV for decisions / holds / receipts | Preview rows match; CSV downloads | **Reports** |
| B12 | **Access log**: open after viewing a receipt | Access entries show actor + time | Access log |
| B13 | Share / public **Verify** link in a new tab | Seal checks run on public page | Verify (new tab) |
| B14 | Wrong-key story on simulator | **401**; no case created; “what was sent” shows 401 | Simulator |

---

## C. Cleanup

| # | You do | Expected |
|---|--------|----------|
| C1 | Dry-run wipe: `pnpm pilot:wipe-tenant --slug <test-slug>` | Row counts only; nothing deleted |
| C2 | Real wipe (test/demo only): `AEGIS_ALLOW_TENANT_WIPE=1 pnpm pilot:wipe-tenant --slug <slug> --confirm <slug>` | Zero tenant rows; platform wipe audit row remains |
| C3 | Demo Bank refresh: `pnpm demo:fresh` (needs `DEMO_BANK_INGEST_KEY` + wipe allow) | Demo Bank reprovisioned; **same** ingest key hash; history re-seeded |
| C4 | Confirm customer orgs untouched | Other org cases/receipts still verify offline |

Production (Railway) command shapes: `docs/DEPLOY_PRODUCTION.md` §10.1.

---

## D. Automated companions (operator laptop)

Run and keep logs:

```text
pnpm --filter aegis-api test
pnpm docs:status-agree
pnpm demo:rehearse
pnpm demo:runbook-walk
pnpm demo:full-menu
pnpm demo:prove-escalation-2min
pnpm demo:prove-cors-cookie
pnpm pilot:provision-demo-tenant   # twice — idempotent
pnpm pilot:seed-history            # demo mode off
node --test tools/bank-simulator/test/key-leak.test.mjs
```
