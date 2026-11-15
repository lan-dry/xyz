# Approver notifications — staging proof script

**Needs your credentials.** Do not commit secrets.

## Env

```powershell
$env:AEGIS_DEMO_MODE="true"
$env:RESEND_API_KEY="<from Resend dashboard>"
$env:AEGIS_NOTIFY_FROM="Aegis <noreply@your-verified-domain>"
$env:AEGIS_TEAMS_WEBHOOK_URL="<incoming webhook>"
# or
$env:AEGIS_SLACK_WEBHOOK_URL="<incoming webhook>"
```

## Proof steps

1. Start API with the env above.
2. Seed demo approvers (`pack:apply --seed-approvers`).
3. Run: `pnpm --filter aegis-api scenario:live -- --approvals=http 2`
4. Confirm email/Teams: no sensitive fields; link opens login only; does not auto-approve.
5. Unit mocks: `pnpm --filter aegis-api exec vitest run test/notify-delivery.test.ts test/notify-approvers.test.ts`

## Honest limits

Staging proof with real Resend/Teams needs founder credentials.
