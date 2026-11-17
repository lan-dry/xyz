# Approver notifications — staging proof script

**Needs your credentials.** Do not commit secrets.

## Env

```powershell
$env:RESEND_API_KEY="<from Resend dashboard>"
$env:AEGIS_NOTIFY_FROM="Aegis <noreply@your-verified-domain>"
$env:AEGIS_TEAMS_WEBHOOK_URL="<incoming webhook>"
# or
$env:AEGIS_SLACK_WEBHOOK_URL="<incoming webhook>"
```

## Proof steps

1. Start API with the env above.
2. Provision the approvers on an `is_demo` tenant: `pnpm pilot:provision-demo-tenant` (no runtime demo mode; `pack:apply --seed-approvers` no longer exists).
3. Trigger a held case from the standalone simulator (`pnpm bank-simulator`, story "Loan RWF 18,000,000") so a real approval request is raised.
4. Confirm email/Teams: no sensitive fields; link opens login only; does not auto-approve.
5. Unit mocks: `pnpm --filter aegis-api exec vitest run test/notify-delivery.test.ts test/notify-approvers.test.ts`

## Honest limits

Staging proof with real Resend/Teams needs founder credentials.
