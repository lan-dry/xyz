# Stage 5 report: Approver binding

Branch `feature/provenance`. **Not committed** (per request). `spec/` untouched.
Stages 1–4 are present on the branch. Status: **Done, with the Partials listed below.**

## What Stage 5 delivers

When a human approves, declines, or releases a held case, the sealed approval outcome
receipt records (1) the hash of the exact request preview the console rendered and
(2) the approver’s authenticated identity (account id, SSO subject if linked, session id,
role at decision time, step-up MFA flag). Offline verify fails if that identity is swapped
in the soft bundle section, or if the approved view hash no longer matches the gate event.
Approving with a stale console hash is refused. Separation of duties remains on by default
and can be turned off only via `metadata.separation_of_duties === false`.

| # | Requirement | Where |
| --- | --- | --- |
| 1 | Seal `approved_view_hash` + `approver_binding` into outcome receipt (finishes A1) | `approvals/approver-binding.ts`, `forensic/issue-approval-outcome.ts`, console `approvals` routes |
| 2 | Verifier: view hash ↔ gate event preview; soft identity ↔ sealed binding | `forensic/evidence-bundle.ts`, `verify-messages.ts` |
| 3 | Optional WebAuthn | Interface only — **Partial** (see below) |
| 4 | Tests listed below | `test/approver-binding.test.ts` |
| 5 | This report | `docs/provenance/STAGE_5_REPORT.md` |

## Choices (where the brief left room)

1. **Canonical view** is the same `RequestPreview` the Approvals console already shows
   (`buildRequestPreview`). Hash is `sha256:` + hex of JCS(canonical preview). The API
   returns `approved_view_hash` on list/detail; the console echoes it on approve/reject.
2. **Stale refuse** compares the client’s echoed hash to a freshly computed hash of the
   live event payload. Mismatch → HTTP 409 `stale_approval_payload`. Slack / callers that
   omit the hash still work; the server seals the current view.
3. **`approver_binding`** fields: `account_id`, `membership_id`, `sso_subject` (first
   `account_oauth.provider_subject` if any), `session_id`, `role_key`, `step_up_mfa`,
   `webauthn_assertion` (always `null` until WebAuthn is finished).
4. **SoD** stays on unless `metadata.separation_of_duties === false`. Existing bank
   packs leave it unset (on).
5. **Gate event `payload`** is included on evidence-bundle sealed events so offline verify
   can recompute the view hash without trusting Aegis.

## Test results (2026-11-19, local)

| Command | Result |
| --- | --- |
| `pnpm --filter aegis-api test test/approver-binding.test.ts` | **7 / 7 passed** |
| With A1 + SoD regression (`approver-binding` + `approval-outcome-receipt` + console/bank guards) | **25 / 25 passed** |
| `pnpm --filter aegis-api typecheck` | **clean** |
| `pnpm --filter @salanor/web-console typecheck` | **clean** |

### Raw output

```
 RUN  v3.2.4 D:/PROJECTS/salanor/services/aegis-api

 ✓ test/approver-binding.test.ts (7 tests) 105ms
 ✓ test/approval-outcome-receipt.test.ts (5 tests) 111ms
 ✓ test/bank-console-approval-guard.test.ts (8 tests) 5ms
 ✓ test/bank-approvals-guard.test.ts (5 tests) 3ms

 Test Files  4 passed (4)
      Tests  25 passed (25)
```

What `test/approver-binding.test.ts` covers (7 tests, all passed):

```
 ✓ hashes the same canonical preview the console request_preview uses
 ✓ exposes WebAuthnApproverAssertion interface without wiring login
 ✓ verifies a hold + outcome with view hash and approver binding
 ✓ change approver after the fact fails verify
 ✓ payload / view hash mismatch fails verify
 ✓ approving a stale payload (event updated since) is refused
 ✓ requester equals approver refused when separation of duties is on
```

### Requirement → test map

| Requirement | Coverage |
| --- | --- |
| Change approver after the fact fails | `change approver after the fact fails verify` |
| Payload / view hash mismatch fails | `payload / view hash mismatch fails verify` |
| Stale payload refuse | `approving a stale payload … is refused` |
| Requester = approver refused when SoD on | `requester equals approver refused when separation of duties is on` |

## Files changed

API (`services/aegis-api`):
- New: `src/approvals/approver-binding.ts`
- New: `test/approver-binding.test.ts`
- Changed: `src/forensic/issue-approval-outcome.ts`, `src/forensic/evidence-bundle.ts`,
  `src/forensic/verify-bundle.ts`, `src/forensic/verify-messages.ts`,
  `src/routes/console/approvals.ts`, `src/bank/approvals-guard.ts`,
  `src/bank/console-approval-guard.ts`

Console (`apps/web-console`):
- Changed: `src/app/aegis/approvals/page.tsx` (echo `approved_view_hash` on decide)

Docs: this report

## Partials and known limits

1. **WebAuthn — Partial.** `WebAuthnApproverAssertion` and `approver_binding.webauthn_assertion`
   exist. Client-supplied assertions are **never** sealed (always `null`) so login is not
   half-broken and an unverified assertion cannot claim binding. Full ceremony
   (credential registration, challenge, assertion verify on approve) is not shipped.
2. **`step_up_mfa`** is accepted on the decide body and sealed, but there is no MFA
   challenge flow yet; it records what the client claimed after a future step-up path.
3. **SSO subject** is the first linked `account_oauth` row when present; password-only
   accounts seal `sso_subject: null`.
4. **Pre-Stage-5 outcome receipts** without `approved_view_hash` / `approver_binding` still
   verify; Stage 5 checks apply when those fields are present.
5. **Trusted-time wording** was a Stage 2 branch drift (`Timestamped by` vs `Trusted time:`), not a main failure; fixed on this branch (see Stage 1 close-out).
