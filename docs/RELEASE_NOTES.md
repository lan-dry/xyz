# Release notes: `release-bank-pilot-1`

**Branch:** `forensic-demo-readiness` · **Compared with:** tag `pre-forensic-demo` · **Release tag:** to be
created by you at release time (`release-bank-pilot-1` does not exist yet). **Not merged. Not deployed.**
Do not merge or deploy from this document alone; the deployment runbook is `docs/DEPLOY_PRODUCTION.md`.

> **The marketing site is NOT published by this release.** `www.salanor.com` is untouched. The website
> changes on this branch (`docs/WEBSITE_CHANGES.md`) are preview only and wait for founder approval.
> Nothing in this release changes what is served at `www.salanor.com`.

Status words in this file follow `docs/FINAL_REPORT.md` and `docs/GAP_REPORT.md` (`pnpm docs:status-agree`).

## What is in the release

- **Governed intake and decisions** for bank events: authority matrix, field policy, record-only mode,
  batch import (record-only), `decision_basis` and plain-language `describeDecision`.
- **Approvals:** role ladder, separation of duties, required reason, dual approver, hard-stop release,
  `escalate_to_role`, **time-bound delegation** (console Delegations page), configurable timed escalation.
- **Evidence:** forensic receipts (append-only, hash-chained), console **evidence bundle** (JSON + one-page
  PDF), public bundle verifier (`/verify`, `POST /v1/public/evidence-bundle/verify`), offline
  `pnpm aegis-verify`, receipt access log.
- **Key custody:** receipt signing key in AWS KMS (Ed25519, Plan A) or an explicitly interim software key
  (Plan B); custody is signed into each receipt and shown on Verify; public keys at `/v1/public/keys`.
- **Trusted time:** RFC 3161 stamp from an outside TSA, attached after issue and retried; pending is amber.
- **Production safety:** boot guards under `AEGIS_ENV=production`, `/ready` (database, witness, TSA, signing
  key), forward-only migrations as a release step with a separate owner role.
- **Hosted demo tenant:** `organization.is_demo`, tenant provisioning over HTTP, historical story seeding,
  **bank simulator** ("Simulated core banking system") deployable at `bank-demo.salanor.com` with a
  passphrase login.
- **Tooling:** `pnpm smoke:production`, `pnpm smoke:kms`, `pnpm demo:up` / `demo:rehearse` / `demo:runbook-walk`.

## Behaviour for existing customers

- **Default unchanged:** policy combine remains the prior default unless a pack sets `combine: all_matching`.
- **Dual publish:** opt-in per policy (`dual_publish_required`); off by default.
- **Record-only:** off by default per workflow.
- **Boot guards apply only when `AEGIS_ENV=production`.** Existing deployments that do not set it start as
  before. When you set it, the API **refuses to start** unless: demo mode is off, the receipt key id is not
  `receipt_dev`, KMS is configured **or** the interim flag and seed are set, `DATABASE_URL` is a
  non-superuser role that cannot `SET session_replication_role`, `CONSOLE_ORIGIN` is set, and an email
  provider is configured. Read `docs/DEPLOY_PRODUCTION.md` before turning it on.
- **Demo endpoints / clock / seed actors:** unavailable when `NODE_ENV` or `AEGIS_ENV` is production.
- **Append-only:** sealed `event` rows reject UPDATE/DELETE of seal columns for the application role
  (migration 015). The app role must not be a superuser (`docs/APPEND_ONLY.md`).
- **`/ready`** is additive: existing fields remain; it adds `checks.witness`, `checks.tsa`, `checks.signing_key`.
  Set `AEGIS_REQUIRED_WORKERS=witness` if only the witness worker runs, or `/ready` returns 503.

## Migrations

Forward only: `pnpm --filter aegis-api db:migrate` (production runs it as the Railway release step with
`MIGRATION_DATABASE_URL`, the schema owner). Greenfield is a single file: `001_baseline`. When the baseline
gains columns on an environment you can wipe, reset with `DROP SCHEMA public CASCADE` then re-migrate
(see `services/aegis-api/migrations/README.md`).

| Version | Purpose | Rollback note |
|---------|---------|---------------|
| `001_baseline` | Single greenfield schema (Aegis + platform + CMS + forensic bank/receipts + tenant wipe + platform email settings). Seeds `plan_catalog` + `salanor-platform` only. | **No in-place downgrade.** Restore from backup, or `DROP SCHEMA public CASCADE` + re-migrate on empty environments. |

Pre-flight for every environment: a backup, then migrate on a copy, then `pnpm aegis-verify` on an exported
bundle (`docs/MIGRATION_ROLLBACK.md`).

## Feature flags and environment defaults

| Flag / env | Default | Notes |
|------------|---------|-------|
| `AEGIS_ENV` | unset | `production` enables the boot guards above |
| `AEGIS_DEMO_MODE` | unset / false | Required for demo clock, `demo:reset`, scenario HTTP. **Refused** when `AEGIS_ENV=production` |
| `AEGIS_DEMO_APPROVAL_PASSWORD` | **none** | Required to seed demo approvers (min 10 chars). Local demo only |
| `AEGIS_RECEIPT_KMS_KEY_ID` | unset | Plan A: AWS KMS key. When set, the software seed is ignored |
| `AEGIS_RECEIPT_KEY_ID` | `receipt_dev` (dev) | Must be a production id in production; one public key per id forever |
| `AEGIS_ALLOW_SOFTWARE_KEY_IN_PRODUCTION` | unset | Only the value `interim`; receipts then say "software key (interim)" |
| `AEGIS_RECEIPT_SIGNING_KEY_B64` | unset | Software seed (Plan B / local). Required to issue receipts without KMS |
| `AEGIS_TSA_URL` / `AEGIS_TSA_NAME` | unset | Outside trusted time when set. Recommended `http://timestamp.sectigo.com`; no SLA |
| `AEGIS_EMAIL_REQUIRED` | true | `false` only if outbound email is intentionally off |
| `AEGIS_REQUIRED_WORKERS` | `witness,housekeeping,compliance` | Which workers `/ready` requires |
| `AEGIS_PACK_REQUIRE_SIGNING_KEY` | false | Fail `pack:apply` if no agent key |
| `AEGIS_UI_PROFILE` | unset | `bank_demo` selects the bank presentation profile (build-time, console) |
| `BANK_SIMULATOR_PASS` | unset | Passphrase for the deployed simulator; unset means loopback-only, no login |
| `MIGRATION_DATABASE_URL` | unset | Owner role for the release step; falls back to `DATABASE_URL` |
| `organization.is_demo` | false | Per tenant, set by provisioning only |

## Upgrade steps (summary; details in `docs/DEPLOY_PRODUCTION.md`)

1. Back up. Create the owner and app database roles (superuser-free app role).
2. Set the variables for the target (`docs/DEPLOY_PRODUCTION.md` section 3). Choose Plan A or Plan B for the receipt key.
3. Deploy the API: the release step migrates, the boot guards run, `/ready` must be 200.
4. Provision tenants, run `pnpm smoke:production` against the smoke-test tenant (never Demo Bank).
5. Publish the receipt key fingerprint out of band.

## Known limits (do not overstate)

- Receipt custody is **interim** until the KMS key is live (Plan B); the product says so on receipts and Verify.
- The public TSA has no availability commitment. The API does not verify the TSA's CMS signature or chain in process (offline `openssl ts -verify`).
- `SOC 2` and `EU AI Act` appear only as **control mappings**, not certifications. No FedRAMP or HIPAA claim. No latency SLA; measured numbers live only in `FINAL_REPORT.md` section 5.
- Hosting region is a founder placeholder until chosen.
- Approver notification delivery needs real Resend credentials to prove end to end (`docs/NOTIFICATIONS_STAGING.md`).

## Diffstat vs `pre-forensic-demo`

```text
# Run locally:
git diff --stat pre-forensic-demo...HEAD
```

## Secret scanning

```powershell
# Example: install gitleaks if needed
gitleaks detect --source . --no-git -v
```

Do not commit `.env`, Resend keys, ingest keys, KMS credentials, simulator passphrases, or
`.demo-tenant-emails.local.json` (gitignored; only the `.example.json` template is committed).
