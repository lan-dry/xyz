# Forensic / bank demo operations

Branch: `forensic-demo-readiness`  
**Do not run reset or demo clock against production databases.**  
Status authority: `docs/FINAL_REPORT.md` and `docs/GAP_REPORT.md` (keep in sync).  
**Last verified:** 2026-11-15

## Guards

- `AEGIS_DEMO_MODE=true` required for demo clock, `demo:reset`, and `POST /v1/aegis/demo/scenarios/run`
- Endpoint and clock refuse when `NODE_ENV=production` or `AEGIS_ENV=production`
- Database URL matching `prod|production|salanor.com` is refused unless `AEGIS_ALLOW_DEMO_ON_NAMED_DB=true`
- Receipts created while the demo clock is active carry `flags.demo_clock = true`
- Demo approver accounts (`*@demo.test`) only via `seedDemoApprovalActors` under demo mode
- **Password:** `AEGIS_DEMO_APPROVAL_PASSWORD` is required (min 10). **No default password.**

## One-command demo

```powershell
$env:AEGIS_DEMO_MODE="true"
$env:AEGIS_DEMO_APPROVAL_PASSWORD="<your-secret-min-10-chars>"
pnpm demo:up          # DB + migrate + pack + API + console
pnpm demo:rehearse    # headless DEMO.md sequence; PASS/FAIL per step
```

Also: `tools/demo/demo-up.ps1` / `tools/demo/demo-up.sh`

## Commands

```powershell
pnpm scenario:run
$env:AEGIS_API_BASE="http://localhost:8080"
$env:AEGIS_INGEST_KEY=$env:AEGIS_INGEST_DEV_KEY
pnpm --filter aegis-api scenario:live
pnpm --filter aegis-api scenario:live -- --approvals=http
pnpm --filter aegis-api export:scenario-bundles
pnpm aegis-verify -- path\to\bundle.json --keys path\to\keys.json
pnpm docs:status-agree
pnpm --filter aegis-api exec vitest run test/evaluate-rules.golden.test.ts
```

## Approvals: fixture vs HTTP

| Mode | Behaviour |
|------|-----------|
| default / `--approvals=fixture` | In-process `checkApprovalAttempt`. Intake still seals where possible. |
| `--approvals=http` | Scenarios **2–7, 5, 9–12**: real `/approvals/request` + console decide/release/escalate where applicable. Each result reports `receipt_kind`. |

## Per-scenario receipt / seal (live `--approvals=http`)

| # | Name | Real APS seal + forensic receipt? | Notes |
|---|------|-----------------------------------|-------|
| 1 | allow AUTH-RL | **Yes** (governed intake) | |
| 2 | hold credit_manager | **Yes** | HTTP console approve |
| 3 | LN-07 model override | **Yes** | HTTP SoD + reason |
| 4 | dual approver reject | **Yes** (HTTP intake) | Dual vote |
| 5 | repeated self-approval | **Yes** (HTTP intake) | Three self-approve 403s |
| 6 | PAY-03 callback | **Yes** (HTTP intake) | callback_verified |
| 7 | hard stop release | **Yes** (HTTP intake) | `POST …/release` |
| 8 | field policy | **Yes** (intake) | |
| 9 | policy v4 dual publish | **Yes** + prior receipt keeps v3 hash | Diff: `GET /policies/:id/diff` |
| 10 | escalation + delegation | **Yes** | demo clock + `escalate_to_role` + delegate windows |
| 11 | unreachable buffer | Receipt with `decided_without_aegis` | Durable local buffer + reconcile report |
| 12 | receipt tamper | **DB-exported chain** (>=5) | Not in-memory fixtures |

## Append-only

See `docs/APPEND_ONLY.md`. App DB role must not be superuser / must not `SET session_replication_role`. Test fixtures use replica role **only** to clear sealed events, never to delete organizations.

## Not done (honest)

- Website **live** publish (founder approval) — preview only; see `WEBSITE_CHANGES.md`
- PNG projector screens under `docs/screens/` (capture checklist in README)
