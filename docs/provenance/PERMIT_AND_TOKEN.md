# In-path permit and decision token

One page. Prefer this over duplicating explanations in Stage reports.

## Two different questions

| | **In-path permit** | **Decision token (AEGIS-TOKEN1)** |
| --- | --- | --- |
| Asks | “May this case complete *right now* given sealed receipts?” | “Are these *exact* executable fields the ones Aegis authorised?” |
| When | Core/Pay calls `POST /v1/aegis/execution/permit` before posting | After allow/approve, when the pack declares `executable_params` |
| Crypto | **None new** — reads forensic receipts already on the case | Short-lived Ed25519 token, domain `AEGIS-TOKEN1` |
| Binds | Case outcome + approved action digest (hold→approve path) | Named fields (`amount`, `currency`, `beneficiary_account`, …) |
| Single-use | No | Yes — online `POST /v1/aegis/executions/confirm` marks used |
| Failure | `held` / `declined` / `stopped` / `digest_mismatch` | `execution_mismatch` + exception row; money must not move |

## How they fit together

1. LOS (or another source) seals a request. Policy may **allow**, **hold**, or **stop**.
2. If humans approve a hold, the outcome receipt seals who approved and what they saw.
3. When the workflow has `executable_params`, Aegis **issues a decision token** on allow/approve.
4. Before money moves, the executor:
   - optionally asks the **permit** (“is this case still executable?”), and
   - **must confirm** the token with the exact params about to post (`execution_control=enforce`).
5. Confirm success raises toward **G2** (`execution_matched`). Permit alone does not.

Permit answers *status of the case*. The token answers *parameters of this payment*. Using only the permit leaves “approved 4M, paid 18M” open; using only a token without a sealed case history loses the human trail. Demo Bank should call **confirm before disbursement**; permit is the in-path gate for “still held / wrong digest / stopped”.

## Where the code lives

- Permit: `services/aegis-api/src/execution/permit.ts`
- Token issue: `services/aegis-api/src/execution/decision-token.ts`
- Confirm: `services/aegis-api/src/execution/confirm.ts`
- Pack fields: `execution/workflow-config.ts` (`executable_params`, `execution_control`, `on_aegis_unavailable`)
- Operator detail + call examples: [EXECUTOR.md](./EXECUTOR.md) (confirm section; this page is the relationship map)

## What not to claim

- Permit is **not** a second signature scheme and is **not** interchangeable with a token.
- A receipt signature is never a valid token (`AEGIS-RECEIPT1` ≠ `AEGIS-TOKEN1`).
- Offline `checkToken` proves sig/expiry/hash only; **single-use needs online confirm**.
