# Bank-ready — user-facing string changes (before → after)

## Pass 1

| Area | Before | After |
|------|--------|-------|
| Case download primary | Download receipt | Download evidence bundle |
| Case download secondary | (same JSON as “receipt”) | Download summary — “Summary for reading. Not independently verifiable.” |
| Append-only copy | Signatures are append-only | Each step is signed and the record is append-only. |
| Replay timing | Rebuilt from N sealed record(s) in 0ms | (speed / 0ms removed; step-through in words) |
| Allowed “who approved” | No approval is linked to this case… | No approval needed: allowed automatically by rule X |
| Empty data | No fields were recorded on this case | Lists attributes with field-policy treatment when present |
| Live feed rows | Completed / Refund Operations Agent / 1 step | Time, bank case id, product/event, RWF amount, outcome, rule(s), approver(s), seal |
| Approvals card | Decision id, policy hash, raw case id | Amount, product, requester, rule, required role, “You are signed in as…” |
| Env strip | Production / FREE plan | Demo environment, synthetic data (plan badge hidden in bank_demo) |
| Governance escalate | Escalate after (hours) | Re-notify after — re-sends the notification only (not escalate_to_role) |
| Outcome chips | Ask a person / Allowed automatically (mixed) | Allowed / Held / Stopped / Released (bank vocab) |
| Technical jargon | governed.action, policy_decision: …, Governed decision allow for case … | Plain sentences; technical names only under Technical details |
| Witness pending | Green Verified with Inclusion: pending | Amber “Not yet witnessed (checked every N s)” / Included at \<UTC\> |
| Policy versions | policy_version: 1 | Story labels **v3** / **v4** (banking pack version 3) |

## Pass 2

| Area | Before | After |
|------|--------|-------|
| Nav / page | Policies | Rules (title + nav) |
| Rules sample box | Test a sample action ($249 Standard/Gold/Business) | Demo Bank evaluator (product, RWF amount, risk class → outcome, rule, role) |
| Rules body | Northwind editor only | Authority matrix + v3/v4 versions + diff + dual-publish explainer |
| Retire / Create | One-click | Typed RETIRE / CREATE confirmation, admin only |
| Verify sample | northwind-payments, amount_usd 249/250 | Try with a Demo Bank bundle + Check both (RWF amount digit tamper) |
| Verify intro | witness tree and transparency log | Plain check list without that jargon |
| Event labels | Loan disbursement for payment/KYC | Payment release / Customer data access / Loan disbursement |
| Rule labels | AUTH-RL, AUTH-RL / raw policy ids | AUTH-RL · Within officer limit (deduped) |
| Hold sentence | credited AUTH-RL for large holds | deciding rule from decision_basis |
| Declined | still said “held” | declined by Name · Role on date, reason: … |
| Approver display | email | Jean Mutabazi · Credit Manager (email in Technical details) |
| Live filters | Agent ID, Status, Save view | Outcome, Product, Date range |
| Overview | FAILED / Completed; duplicate Open live feed; US dates | Bank vocab; one Open live feed; Africa/Kigali 24h |
| Approvals empty | payment waits / trace blocks / operator | Bank wording |
| Access log | Logs; entrys; Location unknown; invite chips | Access log; entries; human sentences; case id filter; chips hidden |
| Reports | download only | Preview table + row count; plain-language CSV headings |
| Simulator amount | button 1,800,000 vs runbook 1,200,000 | Both **RWF 1,200,000** |
| Simulator stories | 5 stories | + sanctions/PEP, PAY-03, escalation, delegation, unreachable |
| Reset | one click | Typed RESET confirmation |
