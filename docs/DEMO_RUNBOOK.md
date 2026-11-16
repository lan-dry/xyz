# Bank demo runbook — browser only

Presenter path for a bank audit / risk / forensic audience.  
**Profile (loud demo):** `AEGIS_UI_PROFILE=bank_demo` (set by `pnpm demo:up`) — Simulator strip, demo filler.  
**Profile (production-style proof):** default console UI + org `is_demo` quiet tag; stories via the **standalone** bank simulator (`BANK_SIMULATOR_URL`), not the in-console Simulator.  
**Viewport:** 1920×1080 and browser zoom 125%. Clean Chrome profile. No terminal during the pitch.

Standing: org **Demo Bank**, pending queue empty, live feed showing realistic historical cases (from `demo:seed-story` / `pilot:seed-history`), active policy labelled **v3**. **v4 is created live** in §4 (dual publish), never pre-seeded.

---

## 0. Open clean

1. Console: `http://localhost:3000/aegis` (after `pnpm demo:up`).
2. Sign in as `admin@demo.test` (password = `AEGIS_DEMO_APPROVAL_PASSWORD`).
3. Confirm strip: **Demo environment, synthetic data**. No “Production”, no plan badge, no Next.js “N” badge.
4. Live feed: historical cases only; **Show demo filler** off; pending Approvals badge **0**.

---

## 1. Allowed within officer limit

1. Open **Simulator** (`/aegis/demo/simulator`).
2. Click **Loan RWF 1,200,000 within officer limit**.
3. Outcome chip: **Allowed**. Open the case.
4. Four answers show real facts: who/what amount/which rule/why allowed; **Who approved** = “No approval needed: allowed automatically by rule AUTH-RL”.
5. **What data was seen** lists amount, currency (and other attributes) with field-policy treatment — not “No fields were recorded”.
6. Click **Verify now**: each check listed pass or fail (signature, hash chain, sequence, policy hash, approvals, witness, trusted time). Pending witness is **amber**, never inside a green Verified box.
7. **Download evidence bundle** (not the reading summary). Keep the file for step 6.

---

## 2. Held → manager approves → released

1. Simulator: **Loan RWF 18,000,000**. Outcome **Held**.
2. Sign in as `officer@demo.test` (Patience Ingabire · Credit Officer) in a second session: use `http://127.0.0.1:3000` for her and `http://localhost:3000` for the others. The two host names keep separate cookies, so both people stay signed in side by side (a separate Chrome profile or a private window also works). Approvals card shows amount, product, required role (Credit Manager), why, and “You are signed in as … You cannot approve this: …”.
3. Approve is refused with a plain sentence.
4. Switch to `manager@demo.test` (Jean Mutabazi · Credit Manager). Card says you can approve. Approve with a reason.
5. Case timeline in words: Request received → Rules checked → Held for Credit Manager → Approved by … → Released.
6. **Watch what happened** — step through the same wording. No “0ms” / speed copy.

---

## 3. Separation of duties + model override

1. Requester tries to approve own case → refused in plain words.
2. Model override path requires a reason (visible on the approval / case UI).

---

## 4. Rules — authority matrix and v3 → v4 (created live)

1. **Rules** page: authority matrix readable (product × amount band × risk → role, “or above”).
2. Standing start: active pack labelled **v3** only. **v4 is not pre-seeded** — it is created live in the room.
3. Prepare a draft of the same pack with **dual publish** required. First authorised publisher activates → pending (“one alone cannot”). Second distinct publisher activates → **v4** goes live.
4. Version list now shows **v3** and **v4**; who published / co-approved.
5. Open the diff (v3 → v4). Earlier receipt from §1 still shows **v3** and its content hash.
6. After demo reset / `demo:up` / pack re-apply, active policy is again **v3** (no leftover live v4).

---

## 5. Hard stop (sanctions / PEP)

1. Simulator: **Sanctions / PEP match: hard stop** (expect **Stopped**). Case stops; manager cannot release.
2. `head@demo.test` (Olivier Kayitesi · Head of Compliance) with a reason can release.
3. Linked release receipt appears on the case.

---

## 6. Evidence — verify then tamper

1. **Evidence** / case: download the **evidence bundle** from the §1 allowed case (sealed under **v3**).
2. **Verify** page: drop the file → **valid** in plain words (still v3 / original content hash even after §4 dual-published **v4**).
3. Edit one character in a text editor; drop again → **fails**, message says what changed.
4. Optional offline: `pnpm aegis-verify` with `keys.json`.

---

## 7. Record-only

1. Switch rule set / workflow to record-only.
2. Resend the RWF 18,000,000 event: nothing blocked; receipt says what **would have** been decided.

---

## 8. Reports and access log

1. **Reports**: filter by date and outcome; download CSV (plain-language columns).
2. **Access log**: who opened which receipt.

---

## 9. Share link

1. Create share link for an auditor → read-only page opens without console admin powers.

---

## 10. Resilience (unreachable Aegis)

1. Simulator: **Aegis unreachable, then replayed**. The bank system loses contact with Aegis.
2. Decision queued, then replayed; receipt marked **decided without Aegis**.

---

## 11. More simulator stories (each card shows its expected outcome)

| Story | Expect | What to point at |
| --- | --- | --- |
| Payment callback not verified | Held | PAY-03: callback must be verified before release; approver supplies `callback_verified`. |
| Escalation after the time limit | Held, then escalated | Simulated time: the approval moves to the next role up. In a live deployment this is the real approval time limit. |
| Delegate inside the window | Held, approvable by the deputy | Aimee Nyirahabimana (`deputy@demo.test`) holds a delegation covering the case. |
| Delegate outside the window | Held, deputy refused | Same deputy, delegation expired or not yet started. |
| Aegis unreachable, then replayed | Allowed | Receipt flagged **decided without Aegis**. |

Reset between rehearsals: simulator **Reset demo data** asks you to type `RESET`; the API refuses without it.

Known gap: the approvals screen sends only a reason, so approvals that also need a reason code or `callback_verified` (hard stop release, PAY-03) are completed through the console API by `pnpm demo:runbook-walk` rather than by clicking.

---

## Operator prep (before the room)

```text
pnpm demo:up
pnpm demo:seed-story          # if demo:up was run with --no-story
pnpm demo:rehearse            # uses demo-bank-rehearsal; does not dirty Demo Bank
```

**Hosted / online testing:** use a dedicated Demo Bank or `smoke-test` organisation — not a customer
org. Provision → point the bank simulator at that tenant’s ingest key → test → delete **that org only**.
Full table: `docs/DEPLOY_PRODUCTION.md` §10 “Test tenant lifecycle”.

Demo logins (password from env). Screens show the person, not the email:

| Email | Shown as |
| --- | --- |
| `admin@demo.test` | Theogene Rugamba · Administrator |
| `officer@demo.test` | Patience Ingabire · Credit Officer |
| `manager@demo.test` | Jean Mutabazi · Credit Manager |
| `comp@demo.test` | Diane Uwizeye · Compliance Officer |
| `head@demo.test` | Olivier Kayitesi · Head of Compliance |
| `dpo@demo.test` | Sandra Murekatete · Data Protection Officer |
| `deputy@demo.test` | Aimee Nyirahabimana (delegate; created by the simulator) |

Two people in one browser: `localhost` and `127.0.0.1` are separate sessions (cookies are kept per host name), so open `http://localhost:3000` as one person and `http://127.0.0.1:3000` as another. This is standard browser behaviour but has not been rehearsed on this build: confirm once before the room.

The pack now includes SANC-01 (sanctions / PEP hard stop) and PAY-03 (payment callback). Re-run `pnpm demo:up` so the active policy picks them up; until then those stories will not give their expected outcome (the simulator says so).

Projector legibility: `bank_demo` sets body text to at least 16px and secondary text to at least 14px with stronger grey contrast.

Screenshots: `pnpm demo:screens` (1920x1080 and a real 125% zoom pass that fails if the two sets are identical). Full walk with all roles: `pnpm demo:runbook-walk` (writes `docs/screens/runbook/`; dirties Demo Bank, so run `pnpm demo:up` or the simulator reset afterwards).
