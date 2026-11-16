# Forensic / bank demo operations

Branch: `forensic-demo-readiness`  
**Do not run reset or demo clock against production databases.**  
Status authority: `docs/FINAL_REPORT.md` and `docs/GAP_REPORT.md` (keep in sync).  
**Last verified:** 2026-11-15

## Guards

- `AEGIS_DEMO_MODE=true` required for demo clock, `demo:reset`, `pg_restore --disable-triggers` restore drill, and `POST /v1/aegis/demo/scenarios/run`
- Endpoint, reset, clock, and disable-triggers restore refuse when `NODE_ENV=production` or `AEGIS_ENV=production`, or when demo mode is off
- Database URL matching `prod|production|salanor.com` is refused unless `AEGIS_ALLOW_DEMO_ON_NAMED_DB=true`
- Receipts created while the demo clock is active carry `flags.demo_clock = true`
- Demo approver accounts (`*@demo.test`) only via `seedDemoApprovalActors` under demo mode
- **Password:** `AEGIS_DEMO_APPROVAL_PASSWORD` is required (min 10). **No default password.**
- **Requester identity (production):** SoD requester must come from **authenticated identity mapping** (session / OIDC), never from client-supplied `attributes.requester_email` alone. Demo HTTP runners may post `requester_email` for theatre only.

## Signing keys (seal vs receipt)

- **APS seal** (after preferred-agent miss): any org **signable** `signing_key` (`key_id` on the sealed event).
- **Forensic receipt:** always `AEGIS_RECEIPT_SIGNING_KEY_B64` under `AEGIS_RECEIPT_KEY_ID` (default `receipt_dev`). Published public key = Ed25519 public derived from that seed (exported in `keys.json` by `export:scenario-bundles`).

## Bank presenter path (browser)

See **`docs/DEMO_RUNBOOK.md`** for the click-by-click bank pitch (Simulator → cases → approvals → evidence → verify).  
Org: **Demo Bank** (`demo-bank`). UI profile: `AEGIS_UI_PROFILE=bank_demo`. Console runs as a **production** Next build under `demo:up` (no dev badge).

F2 / F13 examiner notes: `docs/BANK_READY_NOTES.md`. String map: `docs/BANK_READY_STRINGS.md`.

## One-command demo

```powershell
$env:AEGIS_DEMO_MODE="true"
$env:AEGIS_DEMO_APPROVAL_PASSWORD="<your-secret-min-10-chars>"
pnpm demo:up          # Demo Bank + pack + witness + API + console (prod build)
pnpm demo:seed-story  # ~8 historical cases; pending queue empty (also run by demo:up unless --no-story)
pnpm demo:rehearse    # scratch org demo-bank-rehearsal; does not dirty presenting org
pnpm demo:screens     # Playwright screenshots → docs/screens/ (demo must be up)
```

Also: `tools/demo/demo-up.ps1` / `tools/demo/demo-up.sh`

## Commands

```powershell
pnpm scenario:run
$env:AEGIS_API_BASE="http://localhost:8080"
pnpm --filter aegis-api scenario:live -- --approvals=http   # writes sealed receipts
pnpm --filter aegis-api export:scenario-bundles             # after live/rehearse only
pnpm aegis-verify -- path\to\bundle.json --keys path\to\keys.json
pnpm docs:status-agree
pnpm --filter aegis-api exec vitest run test/evaluate-rules.golden.test.ts
```

`demo:up` ends with `demo:reset` (receipts wiped). Do not run `export:scenario-bundles` until after `demo:rehearse` or `scenario:live`.

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

## P10 truth statements (say these, and only these, about the hosted product)

Use this wording on stage, in follow-up emails and in any customer document. Each line states what is
true **today**; if the configuration changes, change the line, not the audience.

| Topic | True statement | Do not say |
|-------|----------------|------------|
| **Key custody** | Receipts are signed with an Ed25519 key. **Plan A:** the key lives in AWS KMS and is never exported (receipts and Verify say "Key custody: AWS KMS"). **Plan B, until KMS is live:** a software key held in the service environment (receipts and Verify say "Key custody: software key (interim)"). Check `/v1/public/keys` or the Verify page for which one is active, and name it. | "Hardware-protected" or "HSM" while Verify says software key (interim); "customer-controlled keys" (BYOK) as a general claim |
| **Trusted time** | Receipts are stamped by a **public RFC 3161 time authority** (Sectigo by default). It is a free public service with **no SLA**: a stamp can be "pending" (amber) for a while, and the receipt is valid either way. The API reads the token's time and hash; full chain verification is an offline `openssl ts -verify` step. | "Guaranteed timestamp", "legally qualified timestamp" (it is not an eIDAS qualified service) |
| **Hosting region** | `<HOSTING_REGION: founder fills in after choosing the Railway region>`. Until that is filled in and checked in the dashboard, say "region to be confirmed". The console is served from Vercel's edge network and holds no data. | A region, residency or "stays in the EU" claim before the placeholder is replaced |
| **Compliance** | SOC 2 and EU AI Act appear only as **control mappings** (how Aegis features map to controls). No certification or attestation is claimed. | "SOC 2 certified", "EU AI Act compliant" |
| **Performance** | There is **no latency SLA**. Any number comes from the raw load-test output in `FINAL_REPORT.md` section 5, on that machine, and shows no speedup. | "<5 ms", "milliseconds", any availability or latency guarantee |
| **FedRAMP / HIPAA** | Neither is available. They are roadmap items only. | Anything implying FedRAMP authorisation or HIPAA readiness |

Also true and worth saying: sealed decisions cannot be altered by the application database role
(`docs/APPEND_ONLY.md`); a decision made while Aegis was unreachable is marked "decided without Aegis";
`aegis-verify` and the public Verify page check the file you hand them against the published public key.

Hosted stack, deployment, smoke test and simulator: `docs/DEPLOY_PRODUCTION.md`. The marketing site is
**not published**.

## Not done (honest)

- Website **live** publish (founder approval) — preview only; see `WEBSITE_CHANGES.md`
- PNG projector screens under `docs/screens/` (capture checklist in README)
