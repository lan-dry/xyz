# Demo Bank operations (single path)

**Last verified:** 2026-11-17 (branch `remove-demo-mode`)

Local, hosted, and test demos all use the **same path**: a normal API, a tenant with
`organization.is_demo = true`, provisioned / seeded / wiped by the existing pilot commands.
There is **no** runtime demo mode and **no** time travel.

## Removed (do not set / do not call)

| Former surface | Status |
|----------------|--------|
| Demo clock / time travel (`setDemoClock`, etc.) | **Removed.** Approvals, escalation, delegation and receipts use a single `Clock`; production always uses system time. Tests may inject a fake clock in test code only. |
| `POST /v1/aegis/demo/scenarios/*`, `/v1/aegis/demo/simulator/*` | **Removed** (return 404). |
| `demo:reset`, `demo:seed-story`, `scenario:run` / `scenario:live`, in-API scenario runners | **Removed.** |
| In-console Simulator (`/aegis/demo/simulator`) | **Removed.** Use `pnpm bank-simulator`. |
| `seedDemoApprovalActors` / `@demo.test` password path | **Removed.** Personas come from `pilot:provision-demo-tenant` + `.demo-tenant-emails.local.json`. |

## Kept

- `organization.is_demo` / `is_test`, quiet “Demo organisation” tag
- `pnpm pilot:provision-demo-tenant`, `pilot:seed-history`, `pilot:wipe-tenant`, `demo:fresh`, `pack:apply`
- Standalone `pnpm bank-simulator`
- Packs, platform wipe + audit table
- Boot guards when `AEGIS_ENV=production` (for production deployments)

## One-command local demo

```powershell
# Needs PLATFORM_BOOTSTRAP_SECRET and uncommitted .demo-tenant-emails.local.json
pnpm demo:up              # Postgres + normal API + provision + seed Demo Bank
pnpm bank-simulator       # standalone story driver (real timers)
pnpm demo:rehearse        # headless PASS/FAIL against normal API + simulator
pnpm demo:runbook-walk    # click-path + screenshots
pnpm demo:screens         # Playwright shots → docs/screens/
pnpm demo:fresh           # wipe → provision → seed (same as hosted refresh)
```

Also: `tools/demo/demo-up.ps1` / `tools/demo/demo-up.sh`

## Hosted / production-shaped demos

Same commands against the hosted API URL (never enable a “demo mode” flag):

```powershell
pnpm pilot:provision-demo-tenant
pnpm pilot:seed-history
# refresh:
pnpm demo:fresh
# or:
pnpm pilot:wipe-tenant -- --slug demo-bank --confirm demo-bank
```

See `docs/DEPLOY_PRODUCTION.md` and `docs/DEMO_RUNBOOK.md`.

## Escalation (2 minutes)

Held-loan rules carry `escalate_after_ms` (e.g. 120_000). Escalation uses the **real clock**.
Prove with `pnpm demo:prove-escalation-2min` against a running normal API (no time travel).

## Signing keys (seal vs receipt)

- **APS seal** (after preferred-agent miss): any org **signable** `signing_key` (`key_id` on the sealed event).
- **Forensic receipt:** `AEGIS_RECEIPT_SIGNING_KEY_B64` under `AEGIS_RECEIPT_KEY_ID` (or KMS in production).

## Append-only

See `docs/APPEND_ONLY.md`. `pg_restore --disable-triggers` is gated by
`AEGIS_ALLOW_DISABLE_TRIGGERS_RESTORE` on a non-production process — **not** by .

## P10 truth statements (say these, and only these, about the hosted product)

| Topic | True statement | Do not say |
|-------|----------------|------------|
| **Key custody** | Receipts are signed with an Ed25519 key. **Plan A:** the key lives in AWS KMS and is never exported (receipts and Verify say "Key custody: AWS KMS"). **Plan B, until KMS is live:** a software key held in the service environment (receipts and Verify say "Key custody: software key (interim)"). Check `/v1/public/keys` or the Verify page for which one is active, and name it. | "Hardware-protected" or "HSM" while Verify says software key (interim); "customer-controlled keys" (BYOK) as a general claim |
| **Trusted time** | Receipts are stamped by a **public RFC 3161 time authority** (Sectigo by default). It is a free public service with **no SLA**: a stamp can be "pending" (amber) for a while, and the receipt is valid either way. The API reads the token's time and hash; full chain verification is an offline `openssl ts -verify` step. | "Guaranteed timestamp", "legally qualified timestamp" (it is not an eIDAS qualified service) |
| **Hosting region** | `<HOSTING_REGION: founder fills in after choosing the Railway region>`. Until that is filled in and checked in the dashboard, say "region to be confirmed". The console is served from Vercel's edge network and holds no data. | A region, residency or "stays in the EU" claim before the placeholder is replaced |
| **Compliance** | SOC 2 and EU AI Act appear only as **control mappings** (how Aegis features map to controls). No certification or attestation is claimed. | "SOC 2 certified", "EU AI Act compliant" |
| **Performance** | There is **no latency SLA**. Any number comes from the raw load-test output in `FINAL_REPORT.md` section 5, on that machine, and shows no speedup. | "<5 ms", "milliseconds", any availability or latency guarantee |
| **FedRAMP / HIPAA** | Neither is available. They are roadmap items only. | Anything implying FedRAMP authorisation or HIPAA readiness |

Also true: sealed decisions cannot be altered by the application database role
(`docs/APPEND_ONLY.md`); a decision made while Aegis was unreachable is marked "decided without Aegis";
`aegis-verify` and the public Verify page check the file you hand them against the published public key.

Hosted stack: `docs/DEPLOY_PRODUCTION.md`. The marketing site is **not published**.

## Not done (honest)

- Website **live** publish (founder approval) — preview only; see `WEBSITE_CHANGES.md`
