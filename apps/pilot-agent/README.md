# Pilot agent — reference client using `@salanor/aegis`

Runs Northwind Payments demos against the local fixture (or any Console org).

## Local Northwind (recommended)

After `pnpm pilot:reset` (or `pnpm db:local:pilot-fixture`) and `pnpm dev`:

```bash
# Act 1 — retail refund auto-deny (USD 249 vs USD 200 policy)
pnpm pilot:ensure-policy
pnpm pilot:agent

# Act 2 — retail refund needs human approval
pnpm pilot:ensure-approval-policy
pnpm pilot:agent:approval
# Approve in Console, then:
pnpm pilot:agent:resume <approval_id>

# Hero payout — USD 2,500 to a 12-day merchant → approval
pnpm pilot:agent:payout
pnpm pilot:agent:resume:payout <approval_id>
```

Credentials resolve from Postgres + root `.env` (`AEGIS_INGEST_DEV_KEY`, `DEV_SIGNING_PRIVATE_KEY_B64`). Stale Console pastes are ignored.

Sign in at http://localhost:3000 with your bootstrap admin and switch org to **Northwind Payments**.

## Console org (partner / custom)

| `.env` variable | Where in Console |
|-----------------|------------------|
| `AEGIS_ORGANIZATION_ID` | **Settings → Organization** → Organization ID |
| `AEGIS_AGENT_ID`, `AEGIS_KEY_ID`, `AEGIS_SIGNING_PRIVATE_KEY_B64` | **Agents → Create agent** → credentials JSON |
| `AEGIS_INGEST_API_KEY` | **API keys → Create key** → secret (shown once) |

Package: `@salanor/aegis` (workspace `sdks/typescript`).
