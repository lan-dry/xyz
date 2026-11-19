# Stage 3 report: decision token + executor enforcement

Branch `feature/provenance`. **Not committed** (per request). `spec/` untouched. Stages 1–2 are already committed.
Status: **Done, with the Partials listed below.**

## What Stage 3 delivers

When a case is allowed or approved after a hold, Aegis can issue a short-lived **decision token**
that binds the workflow’s `executable_params`. The executor confirms the actual parameters against
that token before money moves. A mismatch, reuse, expiry, stop, tamper, or wrong tenant is sealed
and recorded as an exception. Offline `checkToken` agrees with online confirm for signature /
expiry / hash; single-use still needs the online path.

| # | Requirement | Where |
| --- | --- | --- |
| 1 | Pack/workflow `executable_params`, `execution_control` (default `observe`), `on_aegis_unavailable` (default `allow_and_flag`) | `packs/types.ts`, `execution/workflow-config.ts`, `packs/apply-pack.ts`, demo banking `pack.json` |
| 2 | Decision token AEGIS-TOKEN1 (JCS params hash, Ed25519 base64url, receipt custody) | `packages/aegis-sdk/src/token.ts`, `execution/decision-token.ts` |
| 3 | Issue on allow / approve-after-hold | `bank/handle-event.ts`, `forensic/issue-approval-outcome.ts` |
| 3 | `POST /v1/aegis/executions/confirm` — sig, expiry, used, revoked, stopped, hash; atomic single-use; seal `executed` / `execution_mismatch` | `execution/confirm.ts`, `routes/executions-confirm.ts`, `app.ts` |
| 4 | SDK: `paramsHash`, `signDecisionToken`, `verifyDecisionToken`, `checkToken`, `resolveOnAegisUnavailable` | `@salanor/aegis-sdk` |
| 5 | Well-known + public decision keys; keys/tokens in evidence bundles | `/.well-known/aegis/decision-keys.json`, `/v1/public/decision-keys`, `evidence-bundle.ts` |
| 6 | Break-glass with mandatory reason → `execution_exception` | `confirm.ts` (`break_glass`) |
| 7 | Docs | `docs/provenance/EXECUTOR.md`, this report |
| 8 | Connector `POST /execute/confirm` forwards (source-signs params when no envelope) | `packages/aegis-connector` |
| 9 | Tests listed below | `test/decision-token.test.ts`, SDK `test/token.test.ts`, connector tests |
| 10 | Migration `008_decision_token` registered in `migrate.ts` | `migrations/008_decision_token.sql` |

## Choices (where the brief left room)

1. **Defaults follow the Stage 3 request text**, not the “high assurance = block” line in the longer brief:
   `execution_control` default `observe`; `on_aegis_unavailable` default `allow_and_flag`. Demo
   banking pack sets `enforce` + `allow_and_flag` so the retail loan path exercises confirm.
2. **Same Ed25519 custody as receipts** (`AEGIS_RECEIPT_*` / KMS), domain `AEGIS-TOKEN1`. Decision
   public keys are the published receipt keys under a TOKEN1 scheme description.
3. **No token when `executable_params` is empty** (or a declared field is missing from the case).
   Alias: if the pack asks for `beneficiary_account` and the case only has `beneficiary`, the value
   is copied for binding.
4. **Confirm prefers an executor `source_envelope`**; unsigned `params` still work. The Connector
   adds a source-signed envelope when the caller only sends `params`.
5. **Unavailable path** is reported via `flagged_unavailable: true` on confirm (creates
   `allow_and_flag` or refuses under `block`). SDK `resolveOnAegisUnavailable` is the offline policy
   helper for the executor.
6. **Concurrent single-use** is `UPDATE … WHERE status = 'issued' … RETURNING *` after checks;
   claim happens before the success receipt is sealed so two winners cannot both seal success.

## Test results (2026-11-18, local Postgres)

| Command | Result |
| --- | --- |
| `pnpm --filter @salanor/aegis-sdk test` | **53 / 53 passed** |
| `pnpm --filter @salanor/aegis-connector test` | **24 passed, 1 skipped** |
| `pnpm --filter aegis-api test test/decision-token.test.ts` | **14 / 14 passed** (DB) |
| Targeted set (decision-token + provenance + execution-permit + tenant-wipe) | **37 / 37 passed** |
| `pnpm --filter aegis-api typecheck` | **clean** |
| `pnpm --filter @salanor/aegis-connector typecheck` | **clean** |

### Raw output

SDK:

```
 RUN  v3.2.4 D:/PROJECTS/salanor/packages/aegis-sdk

 ✓ test/jcs.test.ts (4 tests)
 ✓ test/send.test.ts (2 tests)
 ✓ test/token.test.ts (7 tests)
 ✓ test/envelope.test.ts (12 tests)
 ✓ test/conformance.test.ts (28 tests)

 Test Files  5 passed (5)
      Tests  53 passed (53)
```

Connector:

```
 ✓ test/keystore.test.ts (5 tests | 1 skipped)
 ✓ test/durability.test.ts (8 tests)
 ✓ test/connector.test.ts (12 tests)

 Test Files  3 passed (3)
      Tests  24 passed | 1 skipped (25)
```

Decision-token API (includes migration 008 apply on first run):

```
Applied migration 008_decision_token
 ✓ test/decision-token.test.ts (14 tests) 1113ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
```

What `test/decision-token.test.ts` covers (14 tests, all passed):

```
 ✓ match passes
 ✓ field mismatch names amount
 ✓ field mismatch names currency
 ✓ field mismatch names beneficiary_account
 ✓ field mismatch names product
 ✓ reuse fails
 ✓ expired fails
 ✓ stopped case fails
 ✓ tampered token fails
 ✓ wrong tenant fails
 ✓ concurrent confirms: exactly one wins
 ✓ offline checkToken agrees with online confirm
 ✓ allow_and_flag vs block when Aegis was unavailable
 ✓ break-glass requires reason and records an exception
```

Targeted regression:

```
 ✓ test/decision-token.test.ts (14 tests)
 ✓ test/provenance.test.ts (12 tests)
 ✓ test/tenant-wipe-coverage.integration.test.ts (5 tests)
 ✓ test/execution-permit.test.ts (6 tests)

 Test Files  4 passed (4)
      Tests  37 passed (37)
```

## Files changed

SDK (`packages/aegis-sdk`):
- New: `src/token.ts`, `test/token.test.ts`
- Changed: `src/index.ts`

API (`services/aegis-api`):
- New: `migrations/008_decision_token.sql`, `src/execution/workflow-config.ts`,
  `src/execution/decision-token.ts`, `src/execution/confirm.ts`,
  `src/routes/executions-confirm.ts`, `test/decision-token.test.ts`
- Changed: `src/db/migrate.ts`, `src/app.ts`, `src/packs/types.ts`, `src/packs/apply-pack.ts`,
  `src/packs/demo/banking/pack.json`, `src/bank/handle-event.ts`, `src/bank/types.ts`,
  `src/forensic/issue-approval-outcome.ts`, `src/forensic/evidence-bundle.ts`,
  `src/routes/public/index.ts`, `test/integration-fixture.ts`

Connector (`packages/aegis-connector`):
- Changed: `src/config.ts`, `src/connector.ts`, `test/helpers.ts`, `test/connector.test.ts`, `README.md`

Docs: `docs/provenance/EXECUTOR.md`, this report

## Partials and known limits

1. **Bank simulator Core Banking / Payment Gateway** still do not refuse disbursement without
   confirm. Stage 3 delivers the Aegis + Connector + SDK side; wiring the simulator executors is
   left for the bank-simulator rebuild (later stage / follow-up).
2. **Successful confirm sets `execution_matched` on the confirm receipt’s provenance block** but
   does not call `recordGradeChange` to raise the case’s current grade to G2. Grade rise remains
   the Stage 2 helper path until Stage 4 reconciliation automates it.
3. **No Console UI** for tokens, exceptions, or break-glass. Exceptions are in
   `execution_exception` and sealed receipts only.
4. **Observe mode** issues tokens when params are declared but does not block executors that skip
   confirm (by design). Enforce is opt-in per workflow / pack.
5. **Connector confirm envelopes** use a high seq band and are signature-checked only (not
   sequence-accepted into the source registry), so they do not advance `last_seq`.
6. **Trusted-time wording** was a Stage 2 branch drift (`Timestamped by` vs `Trusted time:`), not a main failure; fixed on this branch (see Stage 1 close-out).
