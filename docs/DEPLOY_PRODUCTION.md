# Deploy to production: console on Vercel, API on Railway, optional bank simulator

**Release:** `release-bank-pilot-1` (see `docs/RELEASE_NOTES.md`) · **Status:** runbook, not yet executed
**Scope:** `apps/web-console` on Vercel; `aegis-api`, `aegis-witness`, `salanor-id` and Postgres on Railway;
optionally the bank simulator on Railway at `bank-demo.salanor.com`.
**Not in scope:** the marketing site (`www.salanor.com`) is **not published** by this release. Do not
point `www` at anything from this branch. Nothing in this document deploys by itself.

`docs/PRODUCTION_DEPLOY.md` (Fly.io + Neon, August 2026) is the older general plan. For this release
the hosts are Vercel + Railway as below; where the two disagree, this file wins.

**Never paste secrets** into this repo, chat, tickets or logs. Tables below name variables only. Generate
each secret on your own machine, paste it straight into the host's variable form, and do not save the
output anywhere else.

---

## 1. Topology

```
 Browser ──► app.salanor.com  (Vercel, apps/web-console)
              │  server-side rewrites (same-origin for the browser):
              │    /api/console/*  ──►  api.salanor.com /v1/console/*
              │    /api/public/*   ──►  api.salanor.com /v1/public/*
              │    /api/id/*       ──►  id.salanor.com  /v1/id/*
              ▼
 Railway project "aegis" (one region, see "Hosting region")
   ├─ aegis-api       api.salanor.com        Dockerfile.aegis-api, release step = migrations
   ├─ aegis-witness   (no public URL)        Dockerfile.aegis-witness, Merkle witness loop
   ├─ salanor-id      id.salanor.com         Dockerfile.salanor-id, console login + sessions
   ├─ Postgres        (private network)      one database, two roles (owner, app)
   └─ bank-simulator  bank-demo.salanor.com  optional, Dockerfile.bank-simulator

 Bank systems / simulator ──► api.salanor.com /v1/aegis/*   (bearer ingest key, server to server)
 AWS KMS (Plan A) ◄── aegis-api  (Sign, GetPublicKey only)
 Public TSA (Sectigo) ◄── aegis-api  (RFC 3161 over HTTP, port 80)
```

`salanor-id` is required: the console signs people in against it, and the API validates every console
session by calling it (`SALANOR_ID_URL`). It was not on your short list, but nothing works without it.

**Hosting region:** **eu-west** — Railway EU West Metal (`europe-west4-drams3a`, Amsterdam) for
`aegis-api`, witness, and `salanor-id`. Prefer Neon Postgres in AWS `eu-central-1` (Frankfurt) so data
stays in the EU. Keep API, witness, ID and Postgres in the same product region (`eu-west` in
Organization settings). Vercel serves the console from its edge network; the console holds no data.

---

## 2. Domains, DNS and TLS

| Name | Host | Record | Notes |
|------|------|--------|-------|
| `app.salanor.com` | Vercel (`apps/web-console`) | CNAME to the target Vercel shows (or A to the address Vercel shows) | Add the domain in the Vercel project first, then create the record |
| `api.salanor.com` | Railway `aegis-api` | CNAME to the target Railway shows (plus a TXT verification record if Railway asks) | Add the custom domain in Railway first |
| `id.salanor.com` | Railway `salanor-id` | CNAME, same method | |
| `bank-demo.salanor.com` | Railway `bank-simulator` | CNAME, same method | Optional |
| `www.salanor.com` / apex | unchanged | **do not touch** | Marketing is not published |
| Resend sending domain | Resend | the DKIM / SPF / return-path records Resend lists | For approval and invite email |

TLS certificates are issued by Vercel and Railway automatically once DNS resolves. If the DNS provider
proxies traffic (for example Cloudflare orange cloud), switch the record to DNS-only until the certificate
is issued, then decide whether to proxy.

### Cookies

| Cookie | Set by | Attributes | Why |
|--------|--------|-----------|-----|
| `salanor_session` | `salanor-id` (login), also the console handoff route | `HttpOnly`, `Secure` (because `NODE_ENV=production`), `SameSite=Lax`, `Path=/`, `Domain=.salanor.com` when `SESSION_COOKIE_DOMAIN=.salanor.com` | One login for `app.` and any `*.salanor.com` host |
| `bank_sim_session` | bank simulator | `HttpOnly`, `Secure` over HTTPS, `SameSite=Strict`, host-only (no `Domain`), signed, expires after 8 h by default | Deliberately separate from `salanor_session`; the simulator never sees a console session |

Set `SESSION_COOKIE_DOMAIN=.salanor.com` on **both** `salanor-id` and the Vercel console project. Without
it the cookie is host-only and the API (a different host) will not see it when called directly (the smoke
test and any script pass the cookie by hand and do not need this).

### CORS

- The browser only talks to `app.salanor.com`. The Next.js rewrites in `apps/web-console/next.config.ts`
  forward `/api/console`, `/api/public`, `/api/id` server-side, so browser requests are same-origin and the
  session cookie is first-party.
- `aegis-api` still answers CORS for `/v1/console/*`: it allows exactly `CONSOLE_ORIGIN` and
  `MARKETING_ORIGIN`, with credentials, methods `GET POST DELETE OPTIONS`, header `Content-Type`.
  Values are compared as exact origins: `https://app.salanor.com`, **no trailing slash**.
- `/v1/aegis/*` (event intake, approvals request, policy evaluate) uses bearer ingest keys, is
  server-to-server, and grants no CORS. Never call it from a browser and never put an ingest key in a
  `NEXT_PUBLIC_*` variable.
- `/v1/public/*` (keys, verify) is open by design.
- `AEGIS_API_URL` / `SALANOR_ID_URL` on Vercel must be the **public https origins** and must not be
  `www.salanor.com` (the console config refuses that for insurance, and it breaks the others).

---

## 3. Environment variables

"Secret" = anything that must never appear in git, logs, screenshots or chat. Set secrets in the host's
variable store; treat Railway "sealed"/Vercel "sensitive" options as preferable where available.

### 3.1 Vercel: project `salanor-console` (root `apps/web-console`)

| Name | Purpose | Where | Secret |
|------|---------|-------|--------|
| `AEGIS_API_URL` | Rewrite target for `/api/console` and `/api/public`: `https://api.salanor.com` | Vercel (build + runtime) | N |
| `NEXT_PUBLIC_AEGIS_API_URL` | Same origin, fallback used by the config | Vercel | N |
| `SALANOR_ID_URL` | Rewrite target for `/api/id`: `https://id.salanor.com` | Vercel | N |
| `SESSION_COOKIE_DOMAIN` | `.salanor.com` | Vercel | N |
| `NEXT_PUBLIC_CONSOLE_URL` | `https://app.salanor.com` | Vercel | N |
| `NEXT_PUBLIC_AEGIS_CONSOLE_URL` | `https://app.salanor.com` (case links) | Vercel | N |
| `NEXT_PUBLIC_MARKETING_URL` | `https://www.salanor.com` (links only; the site is not published by this release) | Vercel | N |
| `NEXT_PUBLIC_DOCS_BASE_URL` | `https://docs.salanor.com` or leave unset if docs are not live | Vercel | N |
| `AEGIS_UI_PROFILE` / `NEXT_PUBLIC_AEGIS_UI_PROFILE` | `bank_demo` for the bank pilot look (build-time, whole console) | Vercel | N |
| `AEGIS_INGEST_KEY`, `AEGIS_DEMO_INGEST_KEY`, `AEGIS_INGEST_DEV_KEY` | **Do not set on Vercel.** The in-console simulator that used them was removed and the console must never hold an ingest key. Run the standalone `bank-simulator` service (section 9), which keeps its ingest key server-side | n/a | Y if ever set |
| `DATABASE_URL` | **Do not set on Vercel.** The console holds no database access | n/a | Y |

### 3.2 Railway: service `aegis-api` (config `services/aegis-api/railway.toml`)

| Name | Purpose | Where | Secret |
|------|---------|-------|--------|
| `AEGIS_ENV` | `production`. Turns on boot guards: the API refuses to start with  set (legacy variable), a dev/software key without the interim flag, a superuser DB role, or missing `DATABASE_URL` / `CONSOLE_ORIGIN` / email provider | Railway | N |
| `NODE_ENV` | `production` (the Dockerfile sets it) | image | N |
| `PORT` | Injected by Railway; do not set | Railway | N |
| `DATABASE_URL` | Runtime connection as the **app role** (not superuser, see section 7) | Railway | **Y** |
| `MIGRATION_DATABASE_URL` | Connection as the **owner role**; used only by the release step (`node dist/db/migrate-cli.js`) | Railway | **Y** |
| `CONSOLE_ORIGIN` | `https://app.salanor.com` (CORS + approval links; guard requires it) | Railway | N |
| `CONSOLE_PUBLIC_URL` | `https://app.salanor.com` (deep links) | Railway | N |
| `MARKETING_ORIGIN` | `https://www.salanor.com` (CORS allow-list entry only) | Railway | N |
| `SALANOR_ID_URL` | `https://id.salanor.com`, or the private-network URL of `salanor-id` | Railway | N |
| `AEGIS_BRIDGE_MASTER_KEY` | 32 random bytes. Encrypts agent signing keys held by the signing bridge; without it **Approve/Reject do not work**. Also the fallback for the approval-link secret, so never leave both unset (the code would fall back to a development constant) | Railway | **Y** |
| `AEGIS_APPROVAL_ACTION_SECRET` | Separate secret for Slack/email approval links (optional; defaults to the bridge key) | Railway | **Y** |
| `AEGIS_RECEIPT_KMS_KEY_ID` | Plan A: KMS key ARN | Railway | N (an ARN is an identifier; do not paste it into tickets anyway) |
| `AEGIS_RECEIPT_KMS_REGION` | Region if the id is not an ARN | Railway | N |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Plan A on Railway (no instance role): an IAM user limited to `docs/kms-iam-policy.json` | Railway | **Y** |
| `AEGIS_RECEIPT_KEY_ID` | Public id of the receipt key, e.g. `receipt_prod_2026`. Must not be `receipt_dev`. Fixed to one public key forever | Railway | N |
| `AEGIS_ALLOW_SOFTWARE_KEY_IN_PRODUCTION` | Plan B only: exactly `interim`. Remove when KMS is live | Railway | N |
| `AEGIS_RECEIPT_SIGNING_KEY_B64` | Plan B only: 32-byte Ed25519 seed, base64. **Remove when KMS is live** (it is ignored but warned about) | Railway | **Y** |
| `AEGIS_TSA_URL` | RFC 3161 endpoint, `http://timestamp.sectigo.com` (section 6) | Railway | N |
| `AEGIS_TSA_NAME` | Display name, e.g. `Sectigo` | Railway | N |
| `AEGIS_TSA_RETRY_INTERVAL_SECONDS` | Retry loop wake-up, default 15 | Railway | N |
| `RESEND_API_KEY` | Approval and invite email. The guard refuses to boot without a provider (this env var **or** a key saved in Platform admin > Email) unless `AEGIS_EMAIL_REQUIRED=false`. A key saved in the console wins over this env var; it is stored encrypted under `AEGIS_BRIDGE_MASTER_KEY` (set the same value on aegis-api and salanor-id) and is never returned by any API. DB read access + master key = secret access, the same trust level as this variable | Railway | **Y** (or console key) |
| `INVITE_EMAIL_FROM` | `Salanor <invites@salanor.com>`, on a Resend-verified domain | Railway | N |
| `EMAIL_ASSET_ORIGIN` | Public https origin for the email logo (default points at `www.salanor.com`; set an origin that actually serves it, since the marketing site is not published) | Railway | N |
| `AEGIS_EMAIL_REQUIRED` | Leave unset (true). `false` only if email is intentionally off | Railway | N |
| `AEGIS_REQUIRED_WORKERS` | `witness` while only the witness worker runs. The default is `witness,housekeeping,compliance`, and `/ready` returns 503 when a required worker never reports | Railway | N |
| `AEGIS_WITNESS_MAX_AGE_MINUTES` | Staleness limit for `/ready`, default 10 | Railway | N |
| `DEV_SIGNING_PRIVATE_KEY_B64` | **Do not set.** Development fallback; the guard warns if present | Railway | Y |
| `SENTRY_DSN` | Optional error reporting | Railway | **Y** |
| `COMPLIANCE_EXPORT_DIR` | Only if compliance exports are used; needs a volume | Railway | N |

### 3.3 Railway: service `aegis-witness` (config `services/aegis-api/railway.witness.toml`)

| Name | Purpose | Where | Secret |
|------|---------|-------|--------|
| `DATABASE_URL` | Same **app role** connection string as the API | Railway | **Y** |
| `WITNESS_INTERVAL_MS` | `60000` (default). Batches events into Merkle roots | Railway | N |
| `WITNESS_CHECKPOINT_PRIVATE_KEY_B64` | Signs Merkle checkpoints. Falls back to `DEV_SIGNING_PRIVATE_KEY_B64`; set a dedicated key. Software key (see `KEY_CUSTODY.md`) | Railway | **Y** |
| `WITNESS_CHECKPOINT_KEY_ID` | Default `witness_checkpoint_v1` | Railway | N |

The witness has no HTTP port and no healthcheck. It reports a heartbeat that `/ready` on the API reads.

### 3.4 Railway: service `salanor-id`

| Name | Purpose | Where | Secret |
|------|---------|-------|--------|
| `DATABASE_URL` | Same app-role connection string | Railway | **Y** |
| `CONSOLE_ORIGIN` | `https://app.salanor.com` | Railway | N |
| `PLATFORM_ORIGIN` | `https://ops.salanor.com` or the console origin if Ops is not deployed | Railway | N |
| `MARKETING_ORIGIN` | `https://www.salanor.com` | Railway | N |
| `SESSION_COOKIE_DOMAIN` | `.salanor.com` | Railway | N |
| `AUTH_SECRET` | OAuth state / PKCE; required in production | Railway | **Y** |
| `PLATFORM_BOOTSTRAP_SECRET` | Authorises `/v1/id/platform/*` (tenant provisioning). Held by you; used by `pnpm pilot:provision-demo-tenant` from your machine | Railway | **Y** |
| `RESEND_API_KEY` | Invitation and password-reset email | Railway | **Y** |
| `INVITE_EMAIL_FROM`, `EMAIL_FROM` | Sender identities on the verified domain | Railway | N |
| `SALANOR_ID_PUBLIC_URL` | `https://id.salanor.com` | Railway | N |
| `LOGIN_RATE_LIMIT`, `LOGIN_RATE_WINDOW_MS` | `20`, `900000` | Railway | N |
| `AUTH_GITHUB_*`, `AUTH_GOOGLE_*`, `WORKOS_*`, `SSO_WORKOS_ORG_MAP` | Only if those sign-in methods are enabled | Railway | **Y** |

Set `NODE_ENV=production` (the image does).

### 3.5 Railway: service `bank-simulator` (optional, section 9)

| Name | Purpose | Where | Secret |
|------|---------|-------|--------|
| `BANK_SIMULATOR_PASS` | Shared passphrase for the login page, 12+ characters | Railway | **Y** |
| `BANK_SIMULATOR_SESSION_SECRET` | HMAC key for the session cookie, so sessions survive a restart | Railway | **Y** |
| `AEGIS_API_BASE` | `https://api.salanor.com`. Server-side only | Railway | N |
| `AEGIS_INGEST_KEY` | Ingest key of the tenant the simulator targets. Server-side only; never sent to the browser or written to disk | Railway | **Y** |
| `AEGIS_ORGANIZATION_ID` | That tenant's organisation id (raises approval requests; lets the smoke test confirm the tenant) | Railway | N |
| `AEGIS_CONSOLE_ORIGIN` | `https://app.salanor.com` (case links) | Railway | N |
| `BANK_SIMULATOR_TRUST_PROXY` | `1` (the image sets it) so the login rate limit is per person | Railway / image | N |
| `BANK_SIMULATOR_ALLOWED_HOSTS` | `bank-demo.salanor.com` (optional pin) | Railway | N |
| `BANK_SIMULATOR_DATA_DIR` | `/data` (the image sets it); attach a volume at `/data` to keep the offline queue across redeploys | Railway | N |
| `AEGIS_AGENT_ID`, `AEGIS_KEY_ID`, `AEGIS_AGENT_PRIVATE_KEY_B64` | Only to drain the SDK buffer after the "unreachable" toggle | Railway | **Y** (private key) |

### 3.6 Your machine only (never on a host)

| Name | Purpose | Secret |
|------|---------|--------|
| `PLATFORM_BOOTSTRAP_SECRET` | `pnpm pilot:provision-demo-tenant` | **Y** |
| `AEGIS_INGEST_KEY` | `pnpm pilot:seed-history` | **Y** |
| `DEMO_BANK_INGEST_KEY` | Optional stable Demo Bank ingest key (>= 32 chars). When set, provision/`demo:fresh` store that exact secret (same key across refreshes). When unset, a key is generated and printed **once** | **Y** when set |
| `MIGRATION_DATABASE_URL` | Owner connection, **reachable from your machine** (Railway TCP proxy / public URL, not `*.railway.internal`). Only `pnpm pilot:wipe-tenant` / `pnpm demo:fresh` use it from here | **Y** |
| `AEGIS_ALLOW_TENANT_WIPE` | Set to `1` **in the shell, per command**, to allow a real wipe. Never store it in `.env` or on a host (an `.env` file is ignored for it) | N |
| `SMOKE_*`, `BANK_SIMULATOR_URL`, `BANK_SIMULATOR_PASS` | `pnpm smoke:production` (section 11) | **Y** (keys and passwords) |
| `.demo-tenant-emails.local.json` | Real people's emails and passwords for provisioning. **Gitignored** (`.demo-tenant-emails.local.example.json` is the committed template) | **Y** |

---

## 4. Founder tasks, in order

Lead times are typical, not guaranteed. Start the slow ones first, in parallel.

| # | When | Task | Lead time | Blocks |
|---|------|------|-----------|--------|
| 1 | Day 0 | Confirm you control DNS for `salanor.com` and can add CNAME/TXT records | minutes | everything below |
| 2 | Day 0 | **Resend:** add the sending domain, publish the DKIM / SPF / return-path records, wait for "verified". Create an API key | records minutes; verification from about 15 min up to 72 h | approval and invite email; the API **refuses to boot in production without an email provider** |
| 3 | Day 0 | **AWS (Plan A):** account with billing, then create the KMS key and IAM user (section 5). New accounts can need one to three business days for verification | hours to days | KMS custody label. **Not a blocker**: use Plan B interim until it is ready |
| 4 | Day 0 | Create the **Vercel** project (Pro/Team for an org repo) and the **Railway** project; pick **EU West (Amsterdam)** | same day | |
| 5 | Day 0 | Generate secrets on your machine (commands in 4.1) and store them in a password manager | minutes | |
| 6 | Day 0 to 1 | Railway: add Postgres, create the owner and app roles and grants (section 7), create services `aegis-api`, `aegis-witness`, `salanor-id` with their variables | 1 to 2 h | |
| 7 | Day 0 to 1 | Railway: add custom domains `api.` and `id.`; create the CNAMEs at your DNS | DNS up to your record TTL (usually minutes to 1 h), then certificate issuance minutes | console login |
| 8 | Day 1 | Vercel: set variables (3.1), add `app.salanor.com`, create the CNAME, deploy | 30 min | |
| 9 | Day 1 | First API deploy: the release step runs migrations; confirm `/health` and `/ready`; check the boot log has **no** guard failures | 30 min | |
| 10 | Day 1 | Provision the **Demo Bank** tenant and the **smoke-test** tenant (section 10) | 1 h | smoke test |
| 11 | Day 1 | Run `pnpm smoke:production` until it is all PASS; then once with `SMOKE_STRICT=1` | 1 h | go-live |
| 12 | Day 1 | Publish the receipt key fingerprint **out of band** (contract pack, board pack, your website when it is published) so a party who controls the API cannot swap both key and fingerprint | 15 min | credible verification |
| 13 | Day 1 to 2 | Optional: deploy the bank simulator (section 9 and its separate founder list) | 1 h | |
| 14 | Day 2 | Set up backups and run one restore into a scratch database (section 7) | 2 h | go-live |
| 15 | When KMS is ready | Switch Plan B to Plan A (section 5) | 30 min | removes "software key (interim)" |

### 4.1 Generating secrets (run locally; the output is the secret, do not log it)

```powershell
# 32 random bytes, base64: AEGIS_BRIDGE_MASTER_KEY, AEGIS_APPROVAL_ACTION_SECRET,
# AUTH_SECRET, PLATFORM_BOOTSTRAP_SECRET, BANK_SIMULATOR_SESSION_SECRET, WITNESS_CHECKPOINT_PRIVATE_KEY_B64
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# Plan B receipt seed (same command; it is the 32-byte Ed25519 seed). Needed only for the interim key.
# Database passwords and the simulator passphrase: use the password manager's generator (24+ characters).
```

---

## 5. Receipt signing key: Plan A (KMS) vs Plan B (interim)

Full background: `docs/KEY_CUSTODY.md`. Receipts carry their custody inside the signed body
(`flags.key_custody`), and the Verify page, the evidence bundle and the PDF show it.

| | **Plan A: AWS KMS** | **Plan B: interim software key** |
|---|---|---|
| Private key lives | in AWS KMS, never exported | in `AEGIS_RECEIPT_SIGNING_KEY_B64` in the API's environment |
| Label on receipts / Verify | "Key custody: AWS KMS" | "Key custody: software key (interim)" |
| Boot guard | requires `AEGIS_RECEIPT_KMS_KEY_ID` | requires `AEGIS_ALLOW_SOFTWARE_KEY_IN_PRODUCTION=interim` and the seed; boot log warns |
| Who could forge | someone who can call `kms:Sign` as the IAM user (keys are in Railway variables, so a Railway compromise lets them request signatures; CloudTrail records every call) | anyone who can read the API environment |
| Lead time | AWS account + key + IAM user | none |
| Use for | the bank pilot | getting live while Plan A is prepared. Say "interim" out loud to anyone who asks |

### Plan A steps

1. Create the key. Exact values, do not substitute: `KeySpec ECC_NIST_EDWARDS25519`, `KeyUsage SIGN_VERIFY`.
   Confirm the spec is available in your region first.
   ```
   aws kms create-key --key-spec ECC_NIST_EDWARDS25519 --key-usage SIGN_VERIFY --description "Aegis receipt signing"
   aws kms create-alias --alias-name alias/aegis-receipt-prod --target-key-id <KeyId from the previous output>
   ```
2. Create an IAM user for the API with **only** `docs/kms-iam-policy.json` (`kms:Sign`, `kms:GetPublicKey`, on that one key ARN). Create an access key; put both halves in Railway variables on `aegis-api` only.
3. Turn on a CloudTrail trail to a separate, write-restricted bucket/account and alert on `Sign` from any principal other than that user, and on `DisableKey`, `ScheduleKeyDeletion`, `PutKeyPolicy`.
4. On your machine with the same variables set: `pnpm smoke:kms` must print PASS.
5. On `aegis-api` set `AEGIS_RECEIPT_KMS_KEY_ID`, `AEGIS_RECEIPT_KEY_ID=receipt_prod_2026`; **delete** `AEGIS_RECEIPT_SIGNING_KEY_B64` and `AEGIS_ALLOW_SOFTWARE_KEY_IN_PRODUCTION`. Redeploy. The new public key publishes at `/v1/public/keys` on first use.

### Moving from Plan B to Plan A later

Use a **new** `AEGIS_RECEIPT_KEY_ID`. A key id maps to one public key forever in production; reusing the
interim id with the KMS key is refused. Retire the interim key (`retireReceiptSigningKey`); old receipts
stay valid and stay labelled "software key (interim)". Do not edit history.

---

## 6. Trusted time: TSA choice

`AEGIS_TSA_URL=http://timestamp.sectigo.com` and `AEGIS_TSA_NAME=Sectigo` (set on `aegis-api`).

Why Sectigo: commercial public CA, long operating history (it timestamps code signatures), free, no
account or key, SHA-256 imprints, published certificate chain so anyone can verify a token offline.
Alternatives: DigiCert `http://timestamp.digicert.com` (equivalent standing); FreeTSA `https://freetsa.org/tsr`
(volunteer service, trials only). Switching is only the URL/name; old stamps keep their authority.

Say plainly to customers: a free public TSA has **no SLA**. Receipts are issued immediately and stamped
afterwards; an unreachable TSA shows "Trusted time: pending" in amber, never green, and `/ready` reports it
as a warning, not a failure. The API checks the token's imprint and time but does not verify the CMS
signature or chain in process; that is an offline `openssl ts -verify` step (`docs/TRUSTED_TIME.md`).
For a contractual SLA move to a paid TSA's HTTPS endpoint. Railway must be allowed outbound HTTP on port 80.

---

## 7. Database: Postgres on Railway

### Roles (required) — copy these steps

Railway's default database user is a **superuser**. A superuser (or any role that can
`SET session_replication_role`) bypasses append-only triggers on sealed events and receipts
(`docs/APPEND_ONLY.md`), and the API **refuses to boot in production** with such a `DATABASE_URL`.

Create **two** limited roles and use them separately:

| Role | Env var | Used by |
|------|---------|---------|
| `aegis_owner` | `MIGRATION_DATABASE_URL` | Migrations, `pilot:wipe-tenant`, `demo:fresh` |
| `aegis_app` | `DATABASE_URL` (and `DATABASE_URL_UNPOOLED` if set) | `aegis-api`, `aegis-witness`, `salanor-id` — plain DML only |

#### Step 1 — Generate two passwords

Put them in your password manager (not in the repo). Call them `OWNER_PW` and `APP_PW` below.

#### Step 2 — Create roles (once), as the Railway superuser

Open Railway → Postgres → **Connect** → Query / `psql` with the **default** (superuser) URL.
Replace `railway` if your database name differs. Replace the passwords.

```sql
CREATE ROLE aegis_owner LOGIN PASSWORD 'OWNER_PW'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE aegis_app LOGIN PASSWORD 'APP_PW'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

ALTER DATABASE railway OWNER TO aegis_owner;
GRANT CONNECT ON DATABASE railway TO aegis_app;

\c railway
ALTER SCHEMA public OWNER TO aegis_owner;
GRANT USAGE ON SCHEMA public TO aegis_app;
ALTER DEFAULT PRIVILEGES FOR ROLE aegis_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO aegis_app;
ALTER DEFAULT PRIVILEGES FOR ROLE aegis_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO aegis_app;
```

#### Step 3 — Build the two connection URLs

From Railway Postgres variables, take host / port / database name. Prefer the **private** host for
services in the same project (`DATABASE_URL`). Use the **public / TCP proxy** host when you run
migrations or wipe from your laptop.

```text
MIGRATION_DATABASE_URL=postgresql://aegis_owner:OWNER_PW@HOST:PORT/railway
DATABASE_URL=postgresql://aegis_app:APP_PW@HOST:PORT/railway
```

Set both on the `aegis-api` service (and `DATABASE_URL` on `salanor-id` / witness). Never put the
owner password into a customer-facing env file in git.

#### Step 4 — First migration (empty database)

From your machine (owner URL must be reachable — public host if needed):

```powershell
$env:MIGRATION_DATABASE_URL = "postgresql://aegis_owner:OWNER_PW@PUBLIC_HOST:PORT/railway"
pnpm db:migrate
```

Or on Railway after variables are set (if `preDeployCommand` runs migrate):

```text
railway run --service aegis-api node dist/db/migrate-cli.js
```

A fresh migrated database contains **only** the inactive platform org `salanor-platform`.
It does **not** create Northwind, Demo Bank, or any sample customer org. Those come only from
explicit CLIs (`pnpm db:seed:bootstrap`, `pnpm pilot:provision-demo-tenant`, `pnpm demo:seed:northwind`,
`pnpm db:local:pilot-fixture`) — do not run the Northwind/local pilot fixture against production.

#### Step 5 — Tighten sealed tables (after first migrate), as owner

```sql
REVOKE DELETE, TRUNCATE ON event, forensic_receipt FROM aegis_app;
```

#### Step 6 — Verify grants

```powershell
psql $env:MIGRATION_DATABASE_URL -v app_role=aegis_app -f tools/check-append-only-grants.sql
```

The API boot probe also fails if `DATABASE_URL` is a superuser or can set `session_replication_role`.

Keeping `MIGRATION_DATABASE_URL` on the API service makes the owner credential visible to that service's
environment. If you want it out of runtime reach, drop it from the service, delete `preDeployCommand` from
`railway.toml`, and run migrate from your machine or CI before each deploy instead.

Migrations are forward-only; there are no down scripts (`docs/MIGRATION_ROLLBACK.md`).

### Backups

Be explicit about what is and is not in place; do not claim RPO/RTO you have not measured.

1. **Platform backups:** enable Railway volume backups on the Postgres service if your plan offers them, and note the schedule and retention. Treat this as convenience, not your only copy.
2. **Independent logical backups (do this):** nightly `pg_dump -Fc` as the **owner** role to storage outside Railway (an S3 or R2 bucket with versioning / object lock), encrypted, with access limited to you. A Railway cron service or a scheduled GitHub Action can run it. Keep at least 14 daily and 6 monthly copies, and decide retention against your customers' retention rules.
3. **Restore drill (monthly and before go-live):** restore the latest dump into an **empty scratch database** as the owner role with plain `pg_restore` (no `--disable-triggers`; a full restore recreates the append-only triggers after loading data). Then point a scratch API at it, check `/ready`, download an evidence bundle for a known case, and run `pnpm aegis-verify` on it. `pnpm backup-restore-drill` is a **demo-only** tool: it uses `--disable-triggers` and refuses `AEGIS_ENV=production`, so never run it against production.
4. **Never** restore over the live database in place. Restore into a new database, verify, then switch `DATABASE_URL`.
5. A restored database can lose receipts issued after the dump. Receipts are signed and witnessed independently, so any bundle a customer already holds still verifies.
6. Backups contain agent signing keys encrypted with `AEGIS_BRIDGE_MASTER_KEY`: back up that key separately in the password manager (a dump without it cannot decrypt them), and never in the same place as the dump.

---

## 8. Railway service setup

For each service: **Root Directory = repo root**; **Config path** as below; deploy from the branch/tag you
decide (this document does not deploy).

| Service | Config path | Healthcheck | Release step |
|---------|-------------|-------------|--------------|
| `aegis-api` | `services/aegis-api/railway.toml` | `/health` (liveness). `/ready` is for monitoring | `node dist/db/migrate-cli.js` as `MIGRATION_DATABASE_URL` |
| `aegis-witness` | `services/aegis-api/railway.witness.toml` | none (no HTTP port) | none |
| `salanor-id` | Dockerfile `deploy/docker/Dockerfile.salanor-id` (healthcheck `/health`) | `/health` | none |
| `bank-simulator` | `tools/bank-simulator/railway.toml` | `/health` | none |

Checks after the first deploy:

```text
curl -f https://api.salanor.com/health          -> {"status":"ok",...}
curl -f https://api.salanor.com/ready           -> 200; checks.signing_key custody; checks.witness.ok; checks.tsa
curl -f https://api.salanor.com/v1/public/keys  -> your receipt key, custody "kms" or "software_interim"
curl -f https://id.salanor.com/health
```

If `/ready` says a worker is stale, check `aegis-witness` logs and `AEGIS_REQUIRED_WORKERS`. Add an uptime
monitor on `/ready` (it should alert on non-200).

---

## 9. Bank simulator deployment (amended P6)

The bank simulator is **one codebase**, `tools/bank-simulator/server.mjs`, run the same way locally and
deployed: locally on `http://127.0.0.1:4000` (`pnpm bank-simulator`), deployed at
`https://bank-demo.salanor.com`. It plays a bank's core system against a hosted tenant. It is labelled
**Simulated core banking system** in the page title, heading and banner.

How it behaves:

- **Login:** a shared passphrase from `BANK_SIMULATOR_PASS` (12+ characters). The login page posts to
  `/api/login`; success sets the `bank_sim_session` cookie (`HttpOnly`, `SameSite=Strict`, `Secure` over
  HTTPS, signed, 8 h by default). Every other `/api/*` call needs that cookie.
- **Rate limit:** 5 failed logins per client per 15 minutes (30 overall) then `429` with `Retry-After`.
  Set `BANK_SIMULATOR_TRUST_PROXY=1` behind Railway so the limit is per person.
- **Secrets stay server-side:** `AEGIS_API_BASE` and `AEGIS_INGEST_KEY` are read from the environment by the
  server. The browser never receives them; the ingest key is not written to disk and not logged.
- **What it shows:** story buttons (allowed loan, needs manager, model override, KYC data access, sanctions
  stop, unverified payment callback, escalation, delegation inside/outside the window, unreachable), the
  **Aegis unreachable** toggle (queues, then replays on restore, marked "decided without Aegis"), and a
  link to the console case for every result.
- **No passphrase:** the server refuses a non-loopback address and rejects non-loopback `Host` headers, so
  the local default stays local.
- One instance only. Sessions and the offline queue are per process; add a volume at `/data` if the queue
  must survive redeploys.
- It targets exactly one tenant (the one its ingest key belongs to). Point the **Demo Bank** simulator at
  Demo Bank and use a separate local or deployed instance for the smoke-test tenant. `pnpm smoke:production`
  refuses a simulator that reports a different organisation.
- There is **no** in-console simulator and no API demo endpoint any more (`/aegis/demo/simulator` and
  `/v1/aegis/demo/*` are gone and return 404). On the hosted stack this service **is** the simulator. It
  uses the same public intake and approvals endpoints, with the tenant's real ingest key, as any bank
  system would, so there is no special API mode to switch on. Time is the real wall clock: the
  escalation story waits the real 2-minute window on an `is_demo` tenant.

### Founder steps: simulator only (do these after section 4 step 10)

| # | Task | Lead time |
|---|------|-----------|
| S1 | Make sure the target tenant exists and has its banking pack, bank roles and an ingest key (section 10). Note the ingest key (printed once) and organisation id | done in step 10 |
| S2 | Railway: new service from this repo, Config path `tools/bank-simulator/railway.toml`, **1 replica** | 10 min |
| S3 | Variables: `BANK_SIMULATOR_PASS`, `BANK_SIMULATOR_SESSION_SECRET`, `AEGIS_API_BASE`, `AEGIS_INGEST_KEY`, `AEGIS_ORGANIZATION_ID`, `AEGIS_CONSOLE_ORIGIN`, `BANK_SIMULATOR_ALLOWED_HOSTS` (section 3.5). Generate the passphrase and secret locally | 10 min |
| S4 | Optional: add a volume at `/data` | 5 min |
| S5 | Add custom domain `bank-demo.salanor.com`; create the CNAME at your DNS | DNS up to your TTL, then certificate minutes |
| S6 | Open the URL, confirm the login page, the "Simulated core banking system" label, sign in, send "Loan RWF 1,200,000 within officer limit", follow the console link | 10 min |
| S7 | Run `pnpm smoke:production` with `BANK_SIMULATOR_URL` and `BANK_SIMULATOR_PASS` set against the **smoke-test** tenant's simulator (a separate instance, or temporary local one on `:4000`) | 15 min |
| S8 | Share the passphrase with presenters through your password manager, not chat or email; rotate it by changing the variable (it ends all sessions only if you also rotate `BANK_SIMULATOR_SESSION_SECRET`) | 5 min |

Locally against hosted (rehearsal from your laptop) needs no deploy:

```powershell
$env:AEGIS_API_BASE = "https://api.salanor.com"
$env:AEGIS_INGEST_KEY = "<ingest key>"          # from your password manager
$env:AEGIS_ORGANIZATION_ID = "<organisation id>"
pnpm bank-simulator                              # http://127.0.0.1:4000, loopback only, no login
```

---

## 10. Provision tenants (HTTP only; no direct database access)

Both tenants use the same tooling, driven by an uncommitted file. Copy
`.demo-tenant-emails.local.example.json` to `.demo-tenant-emails.local.json` (**gitignored**) and fill in
real addresses and passwords (min 10 characters). For a second tenant, keep a second file and point
`DEMO_TENANT_FILE` at it.

```powershell
$env:PLATFORM_BOOTSTRAP_SECRET = "<from your password manager>"
pnpm pilot:provision-demo-tenant                 # Demo Bank: org, agents + signing bridge, ingest key (shown once), banking pack, invitations, bank roles
pnpm pilot:seed-history                          # synthetic history for Demo Bank (needs the ingest key)
$env:DEMO_TENANT_FILE = "D:\private\smoke-tenant.local.json"   # organization.slug = smoke-test, its own personas
pnpm pilot:provision-demo-tenant                 # smoke-test tenant (never seed history there)
```

Re-run after invitees accept, so bank roles are assigned. The provisioning flags the organisation `is_demo`
(quiet "Demo organisation" tag and a 2-minute escalation window on held loan rules). That flag is the
**only** thing that makes a tenant a demo, and it is the supported path for hosted demos. It changes no
security behaviour and does not add a clock, reset or scenario endpoint; none of those exist (the demo
clock, `demo:reset`, in-API scenario endpoints and  were removed). Clean-up is the
owner-only `pilot:wipe-tenant` / `demo:fresh` (section 10.1), which only ever touches `is_demo` / `is_test`
organisations.

The smoke-test tenant needs these personas: an officer (`credit_officer`), a manager (`credit_manager`),
the org admin; add a delegate (a plain member with no bank role) and a head (`head_of_compliance`) for the
delegation and escalation steps. **The smoke slug must contain `smoke` and must never be `demo-bank`.**

### Test tenant lifecycle (safe add → test → remove)

Aegis is an evidence ledger. **Do not** empty the shared production database, and **do not** send
simulator or smoke traffic into a customer org (or Northwind) if you need a clean teardown.

| Step | What | Notes |
|------|------|--------|
| 1. Deploy once | API, ID, console, witness, bank-simulator | Shared platform; customer orgs stay untouched |
| 2. Provision | `pnpm pilot:provision-demo-tenant` for **Demo Bank** (demos) and/or a **`smoke-test`** org (soak) | Second tenant: set `DEMO_TENANT_FILE` to a smoke JSON (slug contains `smoke`) |
| 3. Wire simulator | `AEGIS_INGEST_KEY`, `AEGIS_ORGANIZATION_ID`, `AEGIS_API_BASE` on the simulator host | Secrets stay server-side — same as production agents |
| 4. Test | Console + `http://…:4000` stories, or `pnpm smoke:production` | Aim smoke **only** at the smoke tenant |
| 5. Remove / reset | `pnpm pilot:wipe-tenant` for the smoke/demo org, or `pnpm demo:fresh` for Demo Bank (section 10.1). Local only: `node tools/scripts/dev-delete-accounts.mjs --purge-orgs <admin@email>` | Hosted: only through the owner-only wipe function; there is no `demo:reset` or  any more; never hand-written `DELETE`s |

**Demo Bank** (`is_demo`) is for presentations; keep it if you still need the room demo. **smoke-test** is
the disposable soak org — create it for a test window, purge it when finished. Production/Sandbox in the
console is a per-org ledger switch (Approvals follow it); it is not a substitute for a separate test org.

### 10.1 Wipe a demo/test tenant, and `demo:fresh` (operator CLI only)

There is **no** wipe, reset or upload control in the customer console or any customer-facing API. These two
commands run from your machine and talk to Postgres as the **owner** role.

**What may be wiped.** Only an organisation with `is_demo = true` or `is_test = true` (migration 020;
`is_test` is set by platform provisioning for any slug containing `smoke`, or by `is_test: true`, and only
the bootstrap-secret holder can change it). A real customer tenant, and `salanor-platform`, are refused by
the database function itself. A slug that merely contains `smoke` is **not** enough on its own.

**Protection (why this does not weaken append-only / APS-1).**

- The wipe is one SECURITY DEFINER function, `platform_wipe_tenant(slug, execute, actor)`, owned by the
  migration/owner role. `EXECUTE` is revoked from `PUBLIC` and from `aegis_app`. The runtime app role gets
  **no** new privilege and still cannot `DELETE` sealed `event` / `forensic_receipt` rows, set
  `session_replication_role`, or alter triggers (the boot probe and `tools/check-append-only-grants.sql`
  keep checking this).
- Inside the function, in one transaction: it re-checks `is_demo OR is_test`; deletes only that
  organisation's rows (every table in `platform_tenant_wipe_tables()`, children first, plus `policy_rule`
  and accounts that belong to no other tenant); transiently disables the two `trg_*_append_only` triggers
  with `ALTER TABLE ... DISABLE TRIGGER` and re-enables them before returning. That DDL is transactional, so
  no other session ever sees the triggers off and any error rolls everything back. `session_replication_role`
  is not used.
- Chains are per tenant (event hash chain, receipt chain, Merkle roots, transparency log are all keyed by
  `organization_id`), so wiping one tenant cannot change another tenant's evidence; this is tested
  (`services/aegis-api/test/tenant-wipe.integration.test.ts`: another tenant's evidence bundle and public
  witness/transparency bundle still verify offline after a wipe).
- Every real wipe writes one row to `platform_tenant_wipe_audit` (who/when/tenant/row counts). That table has
  no organisation foreign key, survives the wipe and is itself append-only.
- If a new table with an `organization_id` column ships without being added to the allowlist, the wipe
  refuses to run for a tenant holding rows in it, and `test/tenant-wipe-coverage.integration.test.ts` fails CI.
- Stored files: Aegis keeps export/artifact **metadata** rows (`compliance_export`, `artifact`), which are
  wiped. It does not write files to an object store, so there is nothing else to delete.

**Commands.** `railway run` injects the variables of the linked service; the owner URL must be reachable from
your machine, so override `MIGRATION_DATABASE_URL` with the Postgres **public/TCP-proxy** owner URL (from your
password manager) if the service value is a `railway.internal` host.

```powershell
railway link                                    # once: project + environment (production)
$env:MIGRATION_DATABASE_URL = "<owner url, public host>"
$env:PLATFORM_BOOTSTRAP_SECRET = "<from your password manager>"

# 1. Dry run (default): row counts per table, nothing deleted
railway run pnpm pilot:wipe-tenant --slug smoke-test

# 2. Real wipe: needs BOTH --confirm <slug> and the env opt-in, set for this one command
$env:AEGIS_ALLOW_TENANT_WIPE = "1"
railway run pnpm pilot:wipe-tenant --slug smoke-test --confirm smoke-test
Remove-Item Env:AEGIS_ALLOW_TENANT_WIPE

# Demo Bank: wipe -> re-provision -> re-seed
# Optional: $env:DEMO_BANK_INGEST_KEY = "<stable key>"  (else a new key is printed once)
$env:AEGIS_ALLOW_TENANT_WIPE = "1"
railway run pnpm demo:fresh                     # or: railway run pnpm demo:fresh --dry-run (counts only)
Remove-Item Env:AEGIS_ALLOW_TENANT_WIPE
```

`demo:fresh` checks every precondition before it deletes anything, wipes `demo-bank` (nothing to do if it does
not exist), runs `pilot:provision-demo-tenant` and `pilot:seed-history` (synthetic stories from
`tools/demo/demo-bank-history.example.json`, or `DEMO_HISTORY_FILE`; real emails stay in the uncommitted
`.demo-tenant-emails.local.json`). If `DEMO_BANK_INGEST_KEY` is set, that secret is re-stored (same key). If it
is unset, a new key is generated for the run and printed once at the end. It is idempotent. The tenant gets a
**new organisation id** each time (a fresh chain; ids are not reused), so update `AEGIS_ORGANIZATION_ID` on the
bank-simulator service if you pin it. Exit code 2 from the wipe means refused (nothing deleted). Check the trail
with `SELECT * FROM platform_tenant_wipe_audit ORDER BY wiped_at DESC;` as the owner.

After any bulk `GRANT ... ON ALL TABLES` to `aegis_app`, re-run
`REVOKE ALL ON FUNCTION platform_wipe_tenant(text, boolean, text) FROM aegis_app; REVOKE ALL ON platform_tenant_wipe_audit FROM aegis_app;`
(migration 020 does this once) and confirm with `tools/check-append-only-grants.sql`.

### 10.2 Running admin commands in production

Two ways. Prefer **A** for create / seed. Use **B** when you are already in the Railway console (especially wipe).

#### A. From your laptop (HTTP only for provision + seed)

You need the git repo on your computer. These two commands talk to the live API over HTTPS like a normal
client. They do **not** need Docker.

1. Copy `.demo-tenant-emails.local.example.json` to **`.demo-tenant-emails.local.json`** in the repo root
   (gitignored). Set `api_base` to `https://api.salanor.com`, `id_base` to `https://id.salanor.com`,
   `console_origin` to `https://app.salanor.com`, and fill in real emails/passwords.
2. In PowerShell, set secrets from your password manager (names only below; never commit them):

```powershell
cd D:\PROJECTS\salanor
$env:PLATFORM_BOOTSTRAP_SECRET = "<from password manager>"
# Optional: keep the same ingest key across refreshes
# $env:DEMO_BANK_INGEST_KEY = "<stable key >= 32 chars>"
# Or after a one-time print: $env:AEGIS_INGEST_KEY = "<printed key>"

pnpm pilot:provision-demo-tenant
pnpm pilot:seed-history
```

**What success looks like:** provision prints `Done. Organisation id: …` and (if no key existed) a boxed
`INGEST KEY (shown once, …)`. Seed prints eleven `LN-RW-2026-…` / `PAY-RW-…` / `CD-RW-…` lines and `Done: 11 cases.`

**Variables (names only)** for this laptop path:

| Name | Where |
|------|--------|
| `PLATFORM_BOOTSTRAP_SECRET` | Shell env (required for provision) |
| `DEMO_BANK_INGEST_KEY` or `AEGIS_INGEST_KEY` | Shell env (optional for provision; required for seed unless just printed) |
| `.demo-tenant-emails.local.json` | Uncommitted file in the repo root |

Wipe / `demo:fresh` from the laptop also need `MIGRATION_DATABASE_URL` = the Postgres **owner** URL with a
**public** host (Railway TCP proxy), plus `AEGIS_ALLOW_TENANT_WIPE=1` for a real wipe (section 10.1).

#### B. Inside the Railway `aegis-api` service (compiled `node` lines)

The production API image includes the admin CLIs as plain JavaScript. After a deploy of this Dockerfile:

1. Open **Railway** → project → **`aegis-api`** service → **Shell** (or “One-off command” / console).
2. The service already has `DATABASE_URL`. For wipe / `demo:fresh`, the service must also have
   **`MIGRATION_DATABASE_URL`** set in Railway **Variables** to the **owner** role connection string
   (same value the release migrate step uses). You do not paste it into the shell if it is already a
   service variable.
3. For provision / seed / fresh, create the tenant file in the shell once (paste your real emails), then:

```bash
# Tenant file (Railway disk is ephemeral; recreate after each new shell if needed)
cat > /tmp/demo-tenant.json <<'EOF'
{ ...same shape as .demo-tenant-emails.local.example.json, api_base/id_base pointing at production... }
EOF
export DEMO_TENANT_FILE=/tmp/demo-tenant.json
export PLATFORM_BOOTSTRAP_SECRET="<from password manager>"

node /app/tools/demo/dist/provision-demo-tenant.mjs
node /app/tools/demo/dist/seed-history.mjs

# Wipe dry run (nothing deleted)
node /app/tools/demo/dist/wipe-tenant.mjs --slug demo-bank

# Real wipe (demo/test orgs only)
AEGIS_ALLOW_TENANT_WIPE=1 node /app/tools/demo/dist/wipe-tenant.mjs --slug demo-bank --confirm demo-bank

# Full Demo Bank refresh (optional DEMO_BANK_INGEST_KEY; generates and prints a key if unset)
AEGIS_ALLOW_TENANT_WIPE=1 node /app/tools/demo/dist/demo-fresh.mjs

# Re-apply banking pack (needs organisation uuid from provision output)
node /app/services/aegis-api/dist/packs/apply-pack-cli.js --pack banking --org <organization-uuid>
```

**What success looks like:** same text as on your laptop (`Done. Organisation id`, `Done: 11 cases.`, wipe
table of row counts, or `demo:fresh complete`).

| Command | Prefer | Exact line |
|---------|--------|------------|
| Provision Demo Bank | Laptop | `pnpm pilot:provision-demo-tenant` |
| Seed history | Laptop | `pnpm pilot:seed-history` |
| Wipe (dry / real) | Railway or laptop | `node /app/tools/demo/dist/wipe-tenant.mjs --slug <slug>` |
| `demo:fresh` | Railway or laptop | `node /app/tools/demo/dist/demo-fresh.mjs` |
| `pack:apply` | Railway | `node /app/services/aegis-api/dist/packs/apply-pack-cli.js --pack banking --org <uuid>` |

---

## 11. Smoke test: `pnpm smoke:production`

Script: `tools/smoke/smoke-production.mjs`. HTTP only. It writes real (synthetic) events into the smoke-test
tenant, so never aim it at Demo Bank or a customer tenant. Guards stop it before or right after the first
write if the sessions, the slug, the ingest key prefix or the simulator's organisation id do not match.

| Variable | Purpose | Secret |
|----------|---------|--------|
| `SMOKE_API_BASE` | `https://api.salanor.com` | N |
| `SMOKE_ID_BASE` | `https://id.salanor.com` (default: the API base) | N |
| `SMOKE_INGEST_KEY` | smoke tenant ingest key | **Y** |
| `SMOKE_AGENT_ID` | `agt_…` agent on the smoke tenant with Workflow Bridge enabled (sent as `actor.id`) | N |
| `SMOKE_ORG_SLUG` | default `smoke-test`; must contain `smoke` | N |
| `SMOKE_OFFICER_EMAIL` / `_PASSWORD` | `credit_officer` member | email N / password **Y** |
| `SMOKE_MANAGER_EMAIL` / `_PASSWORD` | `credit_manager` member | email N / password **Y** |
| `SMOKE_ADMIN_EMAIL` / `_PASSWORD` | enables the ingest-key prefix guard | password **Y** |
| `SMOKE_DELEGATE_EMAIL` / `_PASSWORD` | plain member: enables the delegation step | password **Y** |
| `SMOKE_HEAD_EMAIL` / `_PASSWORD` | `head_of_compliance`: closes the escalation case | password **Y** |
| `SMOKE_EXPECT_CUSTODY` | `kms` or `software_interim`: fail if the published key differs | N |
| `SMOKE_TSA_WAIT_SECONDS`, `SMOKE_WITNESS_WAIT_SECONDS` | how long to wait for the stamp / witness batch (defaults 90 / 150; 0 = do not wait) | N |
| `SMOKE_TIMED_ESCALATION=1` | also wait about 2.5 minutes for the automatic escalation (is_demo tenants) | N |
| `SMOKE_STRICT=1` | treat SKIP as FAIL (release gate) | N |
| `BANK_SIMULATOR_URL`, `BANK_SIMULATOR_PASS` | also drive the simulator's own API (login, stories, unreachable toggle) | URL N / passphrase **Y** |

Steps and what each proves:

1. health, `/ready`, published keys (custody)
2. sign in as officer, manager (and optional personas) through `salanor-id`; **tenant guards**
3. governed intake: allow, hold; the first event must appear in the smoke tenant's console
4. approvals over console sessions: officer refused (403), manager approves with a reason
5. evidence bundle download, then `aegis-verify` **PASS**; a tampered copy **FAILS** (CLI and the public verify API)
6. witness inclusion and RFC 3161 stamp (SKIP when not configured on the server)
7. time-bound delegation (403 before, 200 inside, 403 after revoke) and escalation to a higher role
8. bank simulator through its own API: login enforced, wrong passphrase rejected, stories, console link, hold and approve, unreachable toggle queues and replays

Output is `PASS` / `FAIL` / `SKIP` per step; exit code 0 only when nothing failed, 1 on a failure or abort, 2
on missing configuration. Secrets, cookies and keys are redacted from output. The smoke tenant should be
quiet while it runs: `aegis-verify` checks consecutive receipt sequence numbers, so another writer
interleaving on the same chain can cause a false "missing sequence".

---

## 12. Go-live check

- [ ] `AEGIS_ENV=production`,  deleted from every service (Railway and Vercel), boot log shows no guard failures
- [ ] `DATABASE_URL` is the app role; `tools/check-append-only-grants.sql` clean
- [ ] `/ready` 200; witness ok; TSA configured (or knowingly not)
- [ ] `/v1/public/keys` shows the intended custody (Plan A `kms`, or Plan B `software_interim` and you have said so)
- [ ] `pnpm smoke:production` all PASS; once with `SMOKE_STRICT=1`
- [ ] Key fingerprint published out of band
- [ ] Backups running; one restore drilled into a scratch database
- [ ] Approval email delivered to a real inbox (Resend domain verified)
- [ ] `www.salanor.com` untouched (marketing not published)
- [ ] `docs/DEMO.md` truth statements match what is actually configured (hosting region filled in, custody stated correctly)

## 13. Railway migrations (exact steps) and rollback

Migrations run **only** as the Railway **pre-deploy / release** command on `aegis-api`, never at
container start (`services/aegis-api/railway.toml` → `preDeployCommand = ["node dist/db/migrate-cli.js"]`).
The CLI uses `MIGRATION_DATABASE_URL` (schema owner) when set, else `DATABASE_URL`.

### Founder / ops: apply a new build (forward)

1. Merge or promote the image that contains the new SQL under `services/aegis-api/migrations/`.
2. Confirm Railway variables: `MIGRATION_DATABASE_URL` = owner role; `DATABASE_URL` = **app** role
   (no superuser, no `SET session_replication_role`).
3. Deploy `aegis-api`. Railway runs `node dist/db/migrate-cli.js` **before** switching traffic.
4. Watch the deploy log for `migrate:` lines and a zero exit. If migrate fails, the new version does
   **not** take traffic (old containers keep serving).
5. Hit `https://api.salanor.com/ready` → expect `status: "ok"` (or a known degraded TSA/witness skip).
6. Optional check from a laptop: `pnpm --filter aegis-api db:migrate` against a **scratch** clone of
   prod is not required for go-live; use `tools/scripts/upgrade-migrate-check.mts` in CI/staging.

### Rollback

| Layer | Exact action |
|-------|----------------|
| **Code (API)** | Railway → `aegis-api` → Deployments → redeploy the **previous successful** deployment. Schema stays; older code is written to tolerate additive columns (`docs/MIGRATION_ROLLBACK.md`). |
| **Code (console)** | Vercel → Instant Rollback to the previous production deployment. |
| **Code (witness / id / simulator)** | Same as API: redeploy previous Railway deployment for that service. |
| **Failed migrate (release step)** | Do **not** hand-edit prod. Fix the migration on a branch, or restore DB from backup into a new Railway Postgres and re-point `DATABASE_URL` / `MIGRATION_DATABASE_URL` after verifying. |
| **Data** | Restore the latest `pg_dump -Fc` backup into a **new** database (section 7). Point both URLs at it. Never `UPDATE`/`DELETE` sealed `forensic_receipt` / event rows. |
| **Per-migration notes** | `docs/MIGRATION_ROLLBACK.md` (014–017) and the migrations table in `docs/RELEASE_NOTES.md` (incl. `018_organization_is_demo`). Prefer backup restore over `DROP`. |
| **Key custody** | Rolling back code does not change receipts already signed. To leave KMS for interim Plan B, set `AEGIS_ALLOW_SOFTWARE_KEY_IN_PRODUCTION=interim`, a **new** `AEGIS_RECEIPT_KEY_ID`, and the seed; old receipts keep their original custody label. |

### Local reproduction of the release migrate

```powershell
# Owner URL runs migrate; app URL is what the API process uses at runtime.
$env:MIGRATION_DATABASE_URL = "<owner connection>"
$env:DATABASE_URL = "<app role connection>"
node services/aegis-api/dist/db/migrate-cli.js
# or from a built image:
# docker run --rm -e MIGRATION_DATABASE_URL=... <aegis-api-image> node dist/db/migrate-cli.js
```

---

## 14. Known unproven on Railway

Local production-style proofs (Node processes + one Postgres container) do **not** replace these.
Treat every item below as a deploy-day must-check — do not assume it from laptop evidence.

| Item | Why it is still unproven on Railway |
|------|-------------------------------------|
| End-to-end deploy of `aegis-api` / `aegis-witness` / `salanor-id` images | Docker Desktop build/EOF failures blocked container image proof; images exist as Dockerfiles only until a Railway (or CI) build succeeds |
| `preDeployCommand` migrate against Railway Postgres | Documented in §13; not yet executed on a live Railway project for this release |
| `/ready` on `api.salanor.com` after a real deploy | No production Railway deployment of this branch yet |
| Cross-origin cookies on `*.salanor.com` with `Secure` + `Domain=.salanor.com` | Local proofs use `*.localtest.me` over HTTP; `Secure` and shared Domain only show correctly on HTTPS Railway/Vercel |
| CORS allow-list with real `CONSOLE_ORIGIN=https://app.salanor.com` | Local allow-list uses console.local / localtest hosts |
| KMS Plan A receipt custody | Local / interim uses `AEGIS_ALLOW_SOFTWARE_KEY_IN_PRODUCTION=interim` |
| TSA / witness batching under Railway networking + volume | Witness runs locally as a Node process; Railway worker networking not rehearsed |
| Resend approval email to a real inbox from Railway | Requires verified domain + Railway env; not part of local Node proof |
| Custom domains (`api` / `id` / `app` / optional `bank-demo`) TLS | DNS + Railway/Vercel cert provisioning not run |
| `railway run pnpm pilot:wipe-tenant` / `demo:fresh` (section 10.1) | Proven locally against Postgres 16 + local ID/API processes (tests + `.cursor-test-compare/final-verify/`). Not run through the Railway CLI: confirm that your local `MIGRATION_DATABASE_URL` override (public owner URL) wins over the injected private URL, and that the owner role owns every table (migration 020 needs `ALTER TABLE ... DISABLE TRIGGER` on `event` / `forensic_receipt`) |
| `pnpm smoke:production` with `SMOKE_STRICT=1` against Railway URLs | Only meaningful after the API is publicly reachable |
| Hosted `pilot:provision-demo-tenant` against Railway (real emails) | Local idempotent provision/seed is the rehearsal; hosted run still required once ID+API are up |
| Bank simulator on `bank-demo.salanor.com` | Optional service; Dockerfile present, Railway service not stood up |
| Rollback drill on Railway (redeploy previous deployment) | Procedure in §13; not executed on a live project |
