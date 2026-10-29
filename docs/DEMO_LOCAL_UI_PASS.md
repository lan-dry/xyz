# Local UI demo pass (client-facing)

**Rule:** In the room, the buyer only sees the **browser**. Terminal is off-screen setup.

## What you use (and what you don’t)

| Method | Use now? | Why |
|--------|----------|-----|
| **Console UI** (`:3000`) | **Yes — primary** | How clients work: Approvals, Cases, Evidence, Verify |
| **Email / Slack notify** | **Yes** | Click “Review in Console” (or Slack Approve if wired) |
| **`pnpm demo:operator`** | **Setup only** | Creates the $2,500 payout. Run in a hidden terminal before/during setup — never on the projector |
| **`pnpm pilot:agent:*`** | **Setup / resume only** | Same as above; resume after Approve can stay CLI until UI resume exists |
| **SDK in your own app** | **No for this pass** | That’s integration work for a pilot engineering day |
| **n8n** | **No for this pass** | Optional later; not required for the Northwind room |

---

## One-time before the pass

1. Start stack: Console + `aegis-api` + `id` (e.g. `pnpm dev:core`).
2. Sign in as Northwind admin at `http://localhost:3000`.
3. Off-screen: `pnpm demo:seed:northwind` once if Overview looks empty.
4. Off-screen: `pnpm demo:operator` (seeds policies, triggers payout, runs manipulated scenario).

---

## The walk (browser only)

Do these in order. Time yourself (~10 minutes).

1. **Overview** — lived-in metrics; note **Amount stopped**.
2. **Live feed** — see Ask a person / Stopped rows.
3. **Approvals** — open the **$2,500** payout → **Approve** (optional reason) → Confirm.
4. **Resume** (off-screen if needed):  
   `pnpm pilot:agent:resume:payout <apr_…>`  
   (auto-runs `pnpm pilot:publish-proofs`). Then open the **case** — completed / sealed.
5. **Receipt** — Signed receipt → **Create share link** → open `/share/…` in a private window (no login).
6. **Incidents** — `/aegis/incidents?ensure=duplicate-payout` → open case → skim replay / simulate.
7. **Evidence** — Create export or Risk Pack → **Download** ZIP once.
8. **Verify** — `/verify` → paste a live event id (should pass after publish-proofs) **and** **Run tamper demo**.
9. **Manipulated stop** — Live feed or Cases: find Stopped refund; headline should say destination ≠ customer on record.

**If `/verify` says “not in a witness tree”:** sealing ≠ Merkle inclusion. Off-screen run `pnpm pilot:publish-proofs`, then Verify again.

---

## Pass / fail

- **Pass:** You can do 1–9 without fixing code or reading docs mid-flight.
- **Then:** Deploy staging and repeat the same walk there (no localhost for bank demos).

## Explicitly skip for this pass

- Writing new SDK sample apps  
- n8n / gateway wizards  
- Merging services  
- Workspace `:3004`  
- French i18n  
