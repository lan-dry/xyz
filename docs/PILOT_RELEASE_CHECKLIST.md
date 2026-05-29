# Pilot release checklist

Run before tagging a design-partner release or merging a large Aegis change to `main`.

## Automated gates (CI)

On every PR to `main`, the **pilot-gate** job must pass:

1. `pnpm db:migrate` + `pnpm db:seed` (Postgres service — not your local DB)
2. `pnpm --filter @salanor/demo-tools full-system` (aegis-api running)
3. `node tools/scripts/e2e-onboarding.mjs` (aegis-api + salanor-id running)

Locally, reproduce the same sequence:

```bash
docker compose up -d
pnpm db:migrate && pnpm db:seed

# Terminal A
pnpm --filter aegis-api dev

# Terminal B (full-system only needs API)
pnpm demo:full-system

# Terminal C (onboarding needs ID)
pnpm dev:id
pnpm pilot:e2e
```

## Manual smoke (5 min)

| Check | How |
|-------|-----|
| Console login | `dev@salanor.local` + `DEV_CONSOLE_PASSWORD_ORG_A` |
| Policy + ingest | Dashboard demo checklist or `pnpm demo:ingest` |
| Approval notify | Set `APPROVAL_SLACK_WEBHOOK_URL` or `RESEND_API_KEY`; trigger obligation tool; confirm Slack/email + console link |
| Public verify | Open `/verify?org=dev-org&event=<id>` after `demo:full-system` step 4 |
| Compliance export | Console → Exports → one-time ZIP download |

## Environment (staging / pilot)

| Variable | Purpose |
|----------|---------|
| `CONSOLE_ORIGIN` | CORS + approval deep links |
| `APPROVAL_SLACK_WEBHOOK_URL` | Incoming webhook for pending approvals |
| `RESEND_API_KEY` + `INVITE_EMAIL_FROM` | Approval + invite email delivery |
| `APPROVAL_NOTIFY_EMAIL` | Optional comma list override (else org admins) |
| `PLATFORM_BOOTSTRAP_SECRET` | Partner provisioning API |
| `COMPLIANCE_EXPORT_DIR` | Server-side export staging |

## Related docs

- [docs-internal/REMAINING_WORK.md](../docs-internal/REMAINING_WORK.md) — open work (P2+, infra)
- [COMMANDS.md](./COMMANDS.md) — all CLI entry points
- [E2E_PARTNER_ONBOARDING.md](./E2E_PARTNER_ONBOARDING.md) — partner provisioning flow
