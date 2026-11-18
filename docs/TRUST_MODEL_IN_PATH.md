# Trust model: in-path gate (not classical DFIR)

Aegis is a **control-plane attestation gate** for high-risk automated actions.
It is **not** a kernel agent, network tap, or disk-imaging product.

## What Massimiliano will ask

> “If the bank only *sends* you events, can’t they send fake clean stories?”

**Answer:** If Aegis were only a voluntary logger, yes. That is why production
integration puts Aegis **in the path of money (or the tool call)**.

## What we prove

| Adversary move | Defense |
|----------------|---------|
| Edit evidence after the fact | Hash chain + signatures + offline `/verify` / `aegis-verify` |
| Approve loan A, pay beneficiary B | Action digest + bind-check + `POST /v1/aegis/execution/permit` |
| Never call Aegis, still pay | **Core ledger refuses** without a sealed allow/approve (integration requirement) |
| Company-wide fake voluntary logs with no gate | Out of scope as EDR; in-scope as “ungoverned payment = control failure” |

## One sentence

Aegis does not replace CrowdStrike; it makes a high-risk action **cryptographically
incapable of completing** without a sealed policy decision (and human approval
when required), bound to amount/beneficiary, independently verifiable later.

## Spoken lines (demo)

1. “Classical forensics ask what happened on the machine. We ask something banks
   care about more for AI agents: **can this payment complete without a sealed
   decision?** In this simulator, no.”
2. “Watch: disburse without Aegis → refused. Approve in the console, then
   disburse → paid, and the receipt hash is on the ledger entry.”
3. “If they change the amount after approval, the permit fails the digest match.
   If they alter the downloaded evidence file later, offline verify fails. Faking
   a pretty JSON does not unlock the ledger.”

## Demo path (local)

1. Point bank-simulator at local Aegis (`pnpm demo:up` / Setup).
2. Send a **hold** story → open Approvals → approve.
3. On the simulator result: **Try disburse without Aegis** → 403.
4. **Disburse via core ledger** → 200; ledger shows `receipt_id`.
5. Download evidence bundle → drop on `/verify` or `pnpm aegis-verify -- bundle.json`.

API: `POST /v1/aegis/execution/permit` with ingest key and
`{ case_id, action: { amount, currency, beneficiary, … } }`.
