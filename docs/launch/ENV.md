# Environment variables (names only — no values)

Complete list of deployment variables for Gate 0 / Gate 1. Never commit real values.

## Shared / API (`aegis-api`)

| Name | Required | Purpose |
|------|----------|---------|
| `DATABASE_URL` | yes | Runtime Postgres (app role) |
| `MIGRATION_DATABASE_URL` | migrations / wipe | Schema owner |
| `AEGIS_ENV` / `NODE_ENV` | yes | `production` enables start guards |
| `AEGIS_RECEIPT_KMS_KEY_ID` | prod preferred | AWS KMS Ed25519 key |
| `AEGIS_RECEIPT_KMS_REGION` | if key id not ARN | KMS region |
| `AEGIS_RECEIPT_SIGNING_KEY_B64` | interim only | Software seed |
| `AEGIS_ALLOW_SOFTWARE_KEY_IN_PRODUCTION` | interim only | Must be `interim` |
| `REQUIRE_MANAGED_KEY` | Gate 0 | `true` refuses software keys |
| `AEGIS_RECEIPT_KEY_ID` | recommended | Public key id on receipts |
| `AEGIS_BRIDGE_MASTER_KEY` | yes | Encrypts bridge keys |
| `CONSOLE_ORIGIN` / `CONSOLE_PUBLIC_URL` | yes | Console CORS / links |
| `INGEST_RATE_LIMIT_PER_MIN` | no | Default 300 |
| `INGEST_MAX_BODY_BYTES` | no | Default 262144 |
| `EXPORT_RATE_LIMIT_PER_HOUR` | no | Default 60 |
| `SIGNUP_RATE_LIMIT_PER_IP_PER_DAY` | no | Default 10 |
| `SIGNUP_MODE` | no | `approval` (default) or `open` |
| `SANDBOX_SYNTHETIC_EXTRA_REGEX` | no | Extra deny patterns |
| `AEGIS_REQUIRED_WORKERS` | no | e.g. `witness` |
| `AEGIS_WITNESS_MAX_AGE_MINUTES` | no | Ready staleness |
| `ALERT_WEBHOOK_URL` | no | Ops alerts (witness, queue, DB, KMS, 5xx) |
| `ALERT_EMAIL_TO` | no | Ops alerts via Resend |
| `ALERT_QUEUE_LAG_THRESHOLD` | no | Default 500 pending TSA stamps |
| `ALERT_5XX_SPIKE_THRESHOLD` | no | Default 25 HTTP 5xx in 5 minutes |
| `OPS_METRICS_TOKEN` | recommended | Bearer / X-Ops-Token for `/metrics` and `/v1/ops/status` (falls back to `PLATFORM_BOOTSTRAP_SECRET`) |

## Identity (`salanor-id`)

| Name | Required | Purpose |
|------|----------|---------|
| `DATABASE_URL` | yes | Same cluster |
| `RESEND_API_KEY` | email | Invites / verify |
| `PLATFORM_BOOTSTRAP_SECRET` | ops | Platform automation |
| `AUTH_SECRET` | sessions | Cookie signing |

## Bank simulator

| Name | Required | Purpose |
|------|----------|---------|
| `AEGIS_API_BASE` | yes | API URL |
| `AEGIS_INGEST_KEY` | yes | Tenant ingest bearer |
| `AEGIS_ORGANIZATION_ID` | yes | Demo / target org |
| `BANK_SIMULATOR_PASS` | hosted | Login passphrase |
| `BANK_SIMULATOR_DATA_DIR` | hosted | `/data` + volume |
| `RAILWAY_RUN_UID` | volume | `0` if needed |

## Staging

Mirror production names with staging values. See `STAGING.md`.
