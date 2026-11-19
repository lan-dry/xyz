# Deploy provenance (hosted)

Exact steps to bring provenance migrations, env, Demo Bank, bank-simulator, bureau and Connectors onto the hosted stack. Broader production ops remain in `docs/DEPLOY_PRODUCTION.md`.

## 1. Migrations 006–012 (hosted DB)

Run as the **owner** role (`MIGRATION_DATABASE_URL`), never the app role. Order is fixed by `services/aegis-api/src/db/migrate.ts`:

| Order | Version | File | What it adds |
| --- | --- | --- | --- |
| 1 | `006_sources` | `services/aegis-api/migrations/006_sources.sql` | Source registry, keys, nonces, sequence gaps |
| 2 | `007_evidence_grade_change` | `…/007_evidence_grade_change.sql` | Grade-change receipts |
| 3 | `008_decision_token` | `…/008_decision_token.sql` | Decision tokens + confirm |
| 4 | `009_reconciliation` | `…/009_reconciliation.sql` | Feeds, runs, exceptions |
| 5 | `010_collector_cdc` | `…/010_collector_cdc.sql` | Collector CDC events (G3 path) |
| 6 | `011_stage7_facts` | `…/011_stage7_facts.sql` | Third-party signed facts |
| 7 | `012_wipe_disable_update_guards` | `…/012_wipe_disable_update_guards.sql` | Rename wipe-safe append-only guards |

On Railway the release step already applies all pending versions:

```text
railway run --service aegis-api node dist/db/migrate-cli.js
```

From a laptop against the **public** owner URL (not `*.railway.internal`):

```powershell
$env:MIGRATION_DATABASE_URL = "<owner connection string>"
pnpm --filter aegis-api db:migrate
```

Confirm versions:

```sql
SELECT version, applied_at FROM schema_migration
WHERE version LIKE '00%' ORDER BY version;
-- expect 006_sources … 012_wipe_disable_update_guards present
```

Do not skip or reorder. If a mid-range version is missing, migrate will apply only the missing ones in order.

## 2. Env vars — add / remove

### Add (provenance / Demo Bank path)

| Variable | Service | Notes |
| --- | --- | --- |
| `AEGIS_INGEST_KEY` | `bank-simulator`, each Connector | Tenant ingest bearer (secret) |
| `AEGIS_ORGANIZATION_ID` | `bank-simulator` | Demo Bank org id |
| `AEGIS_API_BASE` / `aegis_url` | simulator + Connectors | `https://api.…` |
| `AEGIS_CONSOLE_ORIGIN` | `bank-simulator` | Case links |
| `DEMO_BANK_INGEST_KEY` | laptop only (optional) | Stable key across `demo:fresh` / provision |
| `PLATFORM_BOOTSTRAP_SECRET` | laptop → `salanor-id` | Provision Demo Bank |
| `MIGRATION_DATABASE_URL` | release / laptop migrate | Owner role |
| `AEGIS_CONNECTORS_DIR` | Connector hosts | Persistent volume for keys + state |
| `AEGIS_INGEST_BEARER` | Connector process | Same as ingest key |
| Bureau URL / keys | bureau service + LOS nesting | Register `src_bureau` on the tenant |

### Remove / never set on hosted console

| Variable | Why |
| --- | --- |
| `AEGIS_INGEST_KEY` on Vercel / web-console | Console must not hold ingest keys |
| `AEGIS_DEMO_INGEST_KEY`, `AEGIS_INGEST_DEV_KEY` on console | Same |
| `DATABASE_URL` on Vercel | Console has no DB |
| `DEV_SIGNING_PRIVATE_KEY_B64` on `aegis-api` | Production boot guard |
| `AEGIS_ALLOW_TENANT_WIPE` in Railway env | Only set in a one-shot shell for wipe |

Keep Plan A/B receipt signing vars as in `DEPLOY_PRODUCTION.md` §3.2 / §5.

## 3. Railway: bank-simulator, bureau, three Connectors

### 3.1 Bank-simulator

- Config: `tools/bank-simulator/railway.toml`, **1 replica**, optional volume `/data`.
- Secrets: `BANK_SIMULATOR_PASS`, `BANK_SIMULATOR_SESSION_SECRET`, `AEGIS_INGEST_KEY`.
- Non-secrets: `AEGIS_API_BASE`, `AEGIS_ORGANIZATION_ID`, `AEGIS_CONSOLE_ORIGIN`, `BANK_SIMULATOR_ALLOWED_HOSTS`.
- Domain e.g. `bank-demo.salanor.com`. Point this instance only at **Demo Bank**.

### 3.2 Bureau (third-party fact signer)

- Run the demo bureau HTTP service (LOS nests `src_bureau` facts). Register public key `k_bureau_…` on the Demo Bank org.
- Keep bureau signing private key on the bureau host only (volume or secret), never in the console.

### 3.3 Three Connectors (`src_los`, `src_core`, `src_pay`)

One **active** process per `source_id` (or one source id per instance — see `docs/provenance/INTEGRATION.md`).

For each Connector service on Railway:

1. Persistent volume for `state_dir` + `private.key`.
2. Config JSON (or env): `source_id`, `key_id`, `private_key_path`, `aegis_url`, `ingest_bearer` (= Demo Bank ingest key), `state_dir`, `listen`.
3. Start: `aegis-connector start --config <file>` (`packages/aegis-connector`).
4. Secrets: ingest bearer + key passphrase if the key file is encrypted.
5. On `seq_replay`, the Connector re-reads last accepted seq from Aegis; do not hard-code sequences.

## 4. Provision Demo Bank (hosted)

From a laptop with platform bootstrap access:

```powershell
$env:PLATFORM_BOOTSTRAP_SECRET = "<secret>"
# Fill .demo-tenant-emails.local.json (gitignored) from the example
pnpm pilot:provision-demo-tenant   # org, ingest key (once), pack, personas, bank roles
pnpm pilot:seed-history            # needs the printed ingest key
```

Optional stable key: set `DEMO_BANK_INGEST_KEY` before provision / `demo:fresh`.

Then set Railway `bank-simulator` + Connectors to that org id and ingest key. Re-run pack apply if workflows are empty:  
`pnpm --filter aegis-api pack:apply -- --pack banking --org <org> --force`.

Register connector public keys (`src_los`, `src_core`, `src_pay`, `src_bureau`) in Console → Sources (or `tools/demo/connector-sources.mts`).

## 5. Smoke:production

Against the **smoke-test** tenant (slug contains `smoke`, never `demo-bank`) and its own simulator instance:

```powershell
$env:SMOKE_API_BASE = "https://api.salanor.com"
$env:SMOKE_ID_BASE = "https://id.salanor.com"
$env:SMOKE_CONSOLE = "https://app.salanor.com"
$env:BANK_SIMULATOR_URL = "https://<smoke-simulator-host>"
$env:BANK_SIMULATOR_PASS = "<passphrase>"
# plus SMOKE_* persona passwords / org id as required by tools/smoke/smoke-production.mjs
pnpm smoke:production
pnpm smoke:production   # once more with:
$env:SMOKE_STRICT = "1"
```

Expect every smoke line PASS. `SMOKE_STRICT=1` fails on soft warnings. Do not aim smoke traffic at Demo Bank if you need a clean wipe later.

## 6. Quick verify after deploy

1. `curl -f https://api…/health` and `/ready`
2. Console login as Demo Bank admin
3. Bank-simulator story “loan within limit” → case shows G1 source line
4. Export feed + reconcile → G2 when amounts match
5. `pnpm smoke:production` on the smoke tenant
