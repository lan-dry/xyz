# Pilot release checklist

Run before tagging a design-partner release or merging a large Aegis change to `main`.

## Automated gates (CI)

On every PR to `main`, the **pilot-gate** job must pass:

1. Database migrations against an isolated Postgres service
2. SDK, API, console, and pilot-agent type checks
3. Aegis API unit and integration tests
4. Demo-tool behavior tests

Before a staging or customer release, also run the live-stack checks:

```bash
docker compose up -d
pnpm db:migrate
pnpm db:seed:bootstrap
pnpm db:local:pilot-fixture
pnpm pilot:spine-smoke
pnpm pilot:gate

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
| Console login | Bootstrap administrator, then switch to **Northwind Payments** |
| Policy + ingest | Dashboard demo checklist or `pnpm demo:ingest` |
| Approval notify | Console → Settings → Governance: Slack webhook and/or Email org admins (`RESEND_API_KEY` on API). Trigger obligation tool; confirm Slack/email + console link. |
| Contextual policy | Confirm retail consumer refund above USD 200 blocks or requires approval while another context is allowed |
| Payout hero | `pnpm pilot:agent:payout` — USD 2,500 to a merchant younger than 30 days pauses for approval |
| Public verify | Open `/verify?org=northwind-payments&event=<id>` for an event from the pilot run; use **Try tamper sample** on `/verify` |
| Compliance export | Console → Exports → one-time ZIP download |
| Service readiness | `GET /ready` returns 200 with witness, housekeeping, and compliance workers current |

## Environment (staging / pilot)

| Variable | Purpose |
|----------|---------|
| `CONSOLE_ORIGIN` | CORS + approval deep links |
| `APPROVAL_SLACK_WEBHOOK_URL` | Optional deploy-wide Slack fallback (prefer Governance UI) |
| `RESEND_API_KEY` + `INVITE_EMAIL_FROM` | Approval + invite email (to active org admins) |
| `PLATFORM_BOOTSTRAP_SECRET` | Partner provisioning API |
| `COMPLIANCE_EXPORT_DIR` | Server-side export staging |

## Related docs

- [docs-internal/REMAINING_WORK.md](../docs-internal/REMAINING_WORK.md) — open work (P2+, infra)
- [COMMANDS.md](./COMMANDS.md) — all CLI entry points
- [E2E_PARTNER_ONBOARDING.md](./E2E_PARTNER_ONBOARDING.md) — partner provisioning flow
