# Two-act live demo (hub / Thibaut)

## Act 1 — Automatic deny (5 min)

**Story:** A retail support agent attempts a USD 249 refund. The active retail-consumer policy caps autonomous refunds at USD 200, so Aegis blocks it before the payment call.

```powershell
pnpm pilot:ensure-policy
pnpm pilot:agent
```

Open the printed trace URL. Show: red **Blocked: stripe…**, AI step cards, replay step 5, one event **Verify**.

## Act 2 — Human approve/deny (5 min)

**Story:** Same customer context and amount, but the policy now requires a named human approval above USD 200.

```powershell
pnpm pilot:ensure-approval-policy
pnpm pilot:agent:approval
```

1. Console → **Approvals** → pending row → **Approve** or **Reject** (let Thibaut click).
2. If approved:

```powershell
pnpm pilot:agent:resume <approval_id from terminal JSON>
```

Show trace **COMPLETED** and Approvals **History**.

To switch back to Act 1: `pnpm pilot:ensure-policy` (clears approval rule, restores deny).

## One sentence

> “Act 1: nobody pays without policy. Act 2: high-risk steps pause until a human approves — both are signed and exportable.”

Optional: **Exports → Create export** (30 s) — “auditor ZIP, not screenshots.”
