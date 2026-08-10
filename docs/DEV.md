# Local development

**Status:** Stage 12 — full system verification demo.

**Open work:** [docs-internal/REMAINING_WORK.md](../docs-internal/REMAINING_WORK.md) · **Shipped since plan:** [IMPLEMENTATION_PLAN.md § Since plan approval](../docs-internal/IMPLEMENTATION_PLAN.md#since-plan-approval-shipped-after-2026-05-18)  
**Salanor employee admin (separate app):** [docs-internal/PLATFORM_OPS.md](../docs-internal/PLATFORM_OPS.md)

**Command reference (dev, demo, production, cron):** [COMMANDS.md](./COMMANDS.md)

**Partner onboarding:** [E2E_PARTNER_ONBOARDING.md](./E2E_PARTNER_ONBOARDING.md)  
**Full pilot (reset + UI + reference agent):** [PILOT_WALKTHROUGH.md](./PILOT_WALKTHROUGH.md)

---

## Prerequisites

- Node.js 22 LTS
- pnpm 9+
- Docker Desktop (Postgres 16, Redis 7)
- Git

---

## Clone and install

```bash
git clone git@github.com:salanor-ltd/salanor.git
cd salanor
pnpm install
```

---

## Environment

```bash
cp .env.example .env.local
```

| Variable               | Purpose                          |
| ---------------------- | -------------------------------- |
| `DATABASE_URL`         | Postgres — prefer `127.0.0.1` over `localhost` on Windows |
| `REDIS_URL`            | Redis                            |
| `AEGIS_API_PORT`       | API port (default `8080`)        |
| `AEGIS_INGEST_DEV_KEY` | Dev ingest key (matches seed)    |
| `DEV_SIGNING_PRIVATE_KEY_B64` | Dev Ed25519 key for `key-dev-01` |
| `AEGIS_API_URL`        | e.g. `http://127.0.0.1:8080`     |
| `NEXT_PUBLIC_AEGIS_API_URL` | Console → API (browser)      |
| `CONSOLE_ORIGIN`       | CORS origin for console (default `http://localhost:3000`) |
| `DEV_CONSOLE_PASSWORD_ORG_A` | Dev login for org A (`dev@salanor.local`) |
| `DEV_CONSOLE_PASSWORD_ORG_B` | Dev login for org B (`dev-b@salanor.local`) |
| `PUBLIC_SITE_URL`      | e.g. `http://localhost:3000`     |

Never commit real secrets.

---

## Start local infrastructure

```bash
docker compose up -d
docker compose ps   # postgres + redis healthy
```

If `pnpm db:migrate` fails with password authentication, reset the local volume (destroys data):

```bash
docker compose down -v && docker compose up -d
```

| Service  | Port |
| -------- | ---- |
| Postgres | 5432 |
| Redis    | 6379 |

Schema source of truth: `docs-internal/schema/v1/001_initial.sql`  
Applied via: `services/aegis-api/migrations/001_initial.up.sql`

---

## Database migrations and seed

```bash
pnpm db:migrate
pnpm db:seed
```

Rollback and re-apply (Stage 2 exit test):

```bash
pnpm db:migrate:down
pnpm db:migrate
```

Dev seed (`tools/seed/dev.sql`): org A (demo data) + org B (empty isolation test), users, agent, ingest key.  
Local ingest secret: `aegis_dev_local_change_me` (see `.env.example`).

---

## Run apps

```bash
pnpm dev
# or
pnpm --filter aegis-api dev
```

| Surface       | Local URL |
| ------------- | --------- |
| Aegis Console | http://localhost:3000/aegis (customers) |
| Platform Ops  | http://localhost:3003 (Salanor staff — see [PLATFORM_OPS.md](../docs-internal/PLATFORM_OPS.md)) |
| Marketing     | http://localhost:3001/products/aegis |
| API health    | http://localhost:8080/health |

---

## Tests

```bash
pnpm lint
pnpm typecheck
pnpm --filter aegis-api test    # requires DATABASE_URL + Postgres
```

Integration test `TestOrgIsolation` verifies org A cannot read org B events.

---

## Stage 2 exit test

```bash
docker compose up -d
pnpm db:migrate
pnpm db:migrate:down
pnpm db:migrate
pnpm db:seed
pnpm --filter aegis-api test
curl -f http://localhost:8080/health   # database: "up" when DATABASE_URL set
```

---

## Stage 3 — sign + ingest

Start API, then run the demo (uses `.env` at repo root):

```bash
pnpm --filter aegis-api dev
pnpm demo:ingest
pnpm demo:verify-chain
```

Repeat `pnpm demo:ingest` with the same `DEMO_IDEMPOTENCY_KEY` — second call returns HTTP 200 and one row in `event`.

Manual check:

```bash
psql "%DATABASE_URL%" -c "SELECT event_id, event_hash, chain_valid FROM event LIMIT 5;"
```

---

## Stage 4 — console v0

Run API + console (from repo root):

```bash
pnpm dev
```

| Login | Password (default) | Expected |
| ----- | ------------------ | -------- |
| `dev@salanor.local` | `DEV_CONSOLE_PASSWORD_ORG_A` (`dev-admin-change-me`) | Traces from Stage 3 demo |
| `dev-b@salanor.local` | `DEV_CONSOLE_PASSWORD_ORG_B` (`dev-b-admin-change-me`) | Empty trace list |

Console routes: `http://localhost:3000/aegis` (traces, event detail, API keys at `/aegis/keys`).

The console calls the API via same-origin `/api/console/*` (Next.js rewrite to `aegis-api`), so session cookies work on `localhost:3000` without cross-origin CORS.

**Production session (marketing + console):** set `SESSION_COOKIE_DOMAIN=.salanor.com`, host console at `app.salanor.com`, marketing at `salanor.com` (or `www`), and set `CONSOLE_ORIGIN` / `MARKETING_ORIGIN` to those URLs. Marketing proxies `/api/id/*` to Salanor ID and shows **Console** when `salanor_session` is present. On `localhost`, `:3000` and `:3001` cannot share cookies — use production hosts or test console only on `:3000`.

**If console pages 404 on `/api/console/*`:** ensure `aegis-api` is running (`pnpm dev` or `nx run aegis-api:dev`) — the service must expose `/v1/console/*` routes (not health-only).

**If Insurance overview 500:** ensure `insurance-api` is running on port **8092** (`pnpm dev` now starts it; or `pnpm dev:insurance`). Check `http://127.0.0.1:8092/health`.

Create an ingest key in the UI, then:

```bash
AEGIS_INGEST_DEV_KEY=<secret-from-ui> pnpm demo:ingest
```

## Stage 8 — witness + Merkle

Batch unsigned events into a Merkle tree and store proofs:

```bash
pnpm witness:batch
pnpm demo:verify-chain
pnpm demo:verify-inclusion <event_id>
```

Console: open an event → **Verify chain + inclusion**.

Exit test: tamper `event.event_hash` in DB → verification fails; unmodified event passes.

`services/aegis-signer` runs the batch job (TypeScript in Stage 8; Rust binary optional later).

---

## Stage 9 — transparency log + Go SDK

After witness batch, publish append-only transparency log entries:

```bash
pnpm witness:batch
pnpm transparency:publish
```

Public verification (no ingest key):

```bash
curl http://127.0.0.1:8080/v1/public/orgs/dev-org/transparency/head
pnpm verifier:public -- --org dev-org --event <event_id>
```

Third-party verifier: `tools/verifier/` — **no** `@salanor` imports; uses public HTTP API only.

Go SDK: `sdks/go` (`github.com/salanor/salanor-go/aegis`) — sign, ingest, `FetchPublicBundle` / `VerifyPublicBundle`.

DID documents: `GET /v1/public/agents/agent-dev-01/did` or `GET /v1/public/did/did:salanor:dev:agent-01`.

Exit test: `transparency.integration.test.ts` + tamper fails in `tools/verifier`.

---

## Stage 10 — SIEM + compliance exports

New events are exported as **OTLP/HTTP JSON** logs to active `siem_destination` rows (`POST …/v1/logs`). Integration test uses a local mock HTTP server.

Compliance bundles (ZIP on disk, `COMPLIANCE_EXPORT_DIR`):

```bash
pnpm dev
# Console API (admin session):
# POST /v1/console/compliance/exports
#   { "bundle_type": "combined", "period_start": "...", "period_end": "..." }
# GET  /v1/console/compliance/exports/:exportId/download
pnpm compliance:worker   # process pending jobs
```

Bundle contents: `events.ndjson`, `manifest.json`, plus templates `soc2-evidence.json` and/or `eu-ai-act-art12.json`. `integrity_hash` is SHA-256 of the ZIP file.

Exit test: `compliance-export.integration.test.ts` — `status=ready`, downloadable ZIP, hash verifies.

---

## Stage 11 — platform extraction

Shared **Salanor ID** (`services/id`, port `8091`) owns console login. Product APIs validate sessions via `SALANOR_ID_URL` or local DB fallback.

| Service | Port | Role |
| ------- | ---- | ---- |
| `aegis-api` | 8080 | Aegis product |
| `id` | 8091 | Platform auth |
| `insurance-api` | 8092 | Second product (scaffold) |

```bash
docker compose up -d
pnpm db:migrate && pnpm db:seed
pnpm dev   # console + marketing + docs + aegis-api + id (5 processes)
```

Or run individually:

```bash
pnpm dev:id          # Salanor ID — port 8091 (required for login)
pnpm dev:console     # port 3000
pnpm dev:marketing   # port 3001
pnpm dev:docs        # port 3002 → /aegis, /aether
pnpm --filter aegis-api dev   # port 8080
```

| App | URL |
| --- | --- |
| Console | http://localhost:3000 |
| Marketing | http://localhost:3001 |
| Docs | http://localhost:3002/aegis |
| Salanor ID health | http://127.0.0.1:8091/health |
| Aegis API | http://127.0.0.1:8080/health |

Console shell: product switcher (Aegis, Insurance preview).  
Platform login: http://localhost:3000/login — password `DEV_CONSOLE_PASSWORD_ORG_A` from `.env` (default `dev-admin-change-me`).

Set `SALANOR_ID_URL` on `aegis-api` and `insurance-api` so they call `POST /v1/id/auth/validate` instead of reading sessions directly.

Exit test: `insurance-api` in `services/insurance-api` + `/insurance` console routes — no second GitHub repo.

---

## Stage 12 — full system verification

Single script runs the blueprint final demo (proxy allow/deny, approval, witness, public verifier, compliance export, SIEM):

```bash
docker compose up -d
pnpm db:migrate && pnpm db:seed
pnpm --filter aegis-api dev          # terminal 1
pnpm demo:full-system                # terminal 2
```

See `tools/demo/README.md` for step breakdown. Exit code `0` = all seven steps passed.

Optional E2E: set `FULL_SYSTEM_E2E=1` and run with live API (not required for CI unit guard).

---

## Stage 7 — human approvals

Policy rules with `allow_with_obligation` pause the trace (`blocked`) until an admin approves in the console.

```bash
pnpm dev
```

1. Policies → add rule `payments.wire.transfer` / `allow_with_obligation` → Activate  
2. SDK: `wrapFetch` throws `ApprovalRequiredError` (no outbound HTTP)  
3. Console → **Approvals** → Approve  
4. SDK: `wrapFetchResume(approvalId, url, init, config)` runs the deferred fetch and completes the trace  

Integration test: `approval.integration.test.ts` (Stage 7 exit).

---

## Stage 6 — policy engine (OPA)

Policies live in Postgres (`policy`, `policy_rule`). `wrapFetch` calls `POST /v1/aegis/policy/evaluate` (ingest API key) before outbound HTTP. Activate a new policy in the console — SDK consumers pick it up on the next call without redeploy.

```bash
pnpm db:migrate
pnpm db:seed
pnpm --filter aegis-api dev
```

Console: http://localhost:3000/aegis/policies

Rebuild OPA WASM after editing `services/aegis-api/policy/rego/default.rego`:

```bash
pnpm --filter aegis-api policy:build-wasm
```

---

## Stage 5 — proxy (block before call)

`wrapFetch` evaluates a hardcoded deny on `stripe.paymentIntents.create`, ingests a `policy_decision` event, then either blocks (deny) or runs the outbound request and ingests a `result` event (allow).

```bash
pnpm --filter aegis-api dev
pnpm demo:proxy
```

Check events for the printed `trace_id`:

```bash
psql "%DATABASE_URL%" -c "SELECT action_kind, policy_decision, tool_name FROM event WHERE trace_id = '<trace_id>' ORDER BY sequence_num;"
```

Expect: deny path → 1 row (`policy_decision` / `deny`), upstream mock never called; allow path → 2 rows (`policy_decision` / `allow`, then `result` / `allow`) and one upstream call.

---

### Vercel preview (4.4)

1. Import `apps/web-console` in Vercel (Root Directory: `apps/web-console`).
2. Set `NEXT_PUBLIC_AEGIS_API_URL` to a deployed `aegis-api` base URL.
3. On the API host, set `CONSOLE_ORIGIN` to the Vercel preview origin (e.g. `https://<branch>--<project>.vercel.app`).
4. Optional: Neon branch per PR for preview DB (same `DATABASE_URL` on API + migrate/seed).

---

## Useful docs

- [Implementation plan](../docs-internal/IMPLEMENTATION_PLAN.md)
- [APS-1 draft](../docs-internal/aps/APS-1-draft-0.1.md)
- [ADR: organization vs tenant](../docs-internal/adr/0002-organization-vs-tenant.md)
- [Schema v1](../docs-internal/schema/v1/001_initial.sql)
