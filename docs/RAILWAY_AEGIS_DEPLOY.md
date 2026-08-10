# Force-deploy aegis-api on Railway

## Why you see “no new deployment”

GitHub `main` has newer commits (e.g. `a9ef3ee` one-shot `/runs`), but Railway **aegis-api** may still show:

`feat: Workflow Bridge for n8n…` (`6deb2dc`)

That old build **only starts** a trace. It ignores `one_shot` / `execution`, so n8n returns `status: "running"` with **1 event** (`aegis.trace.start`).

Auto-deploy is either off, filtered by watch paths, or not reconnecting after push.

## Fix (2 minutes)

1. Open Railway → project **Salanor** → service **aegis-api**.
2. Open the **⋯** menu on the service (or Deployments).
3. Choose **Deploy** / **Redeploy** from **latest commit on `main`**  
   (commit message should mention **one-shot** / `a9ef3ee` or newer — **not** only the old “feat: Workflow Bridge…”).
4. Wait until **ACTIVE**.
5. Verify:

```text
POST https://api.salanor.com/v1/aegis/workflows/runs
Authorization: Bearer invalid
Body: {"one_shot":true,"execution":{"nodes":[]}}
```

Expect **401** (key invalid). If the body is accepted with a real key, response `status` must be **`completed`**, not `running`.

## Background workers (Railway)

All worker services share:

- **Repo**: `lan-dry/xyz`, branch `main`
- **Root directory**: repo root
- **Custom build command** (required for witness/compliance/housekeeping):

```bash
pnpm install --frozen-lockfile && pnpm --filter @salanor/witness-merkle build
```

Do **not** use default `pnpm run build` (builds entire monorepo and fails).

Apply migration **026_worker_runs** on production Postgres before worker history appears in Platform Ops.

### 1. Witness worker (always on, 60s loop)

| Setting | Value |
|---------|--------|
| Service | `aegis-witness-worker` |
| Start | `pnpm --filter aegis-api witness:worker` |
| Cron | **None** (long-running process) |
| Env | `DATABASE_URL`, optional `WITNESS_INTERVAL_MS=60000` |

Logs: `[witness-worker] starting; interval=60000ms`

### 2. Compliance worker (daily cron)

| Setting | Value |
|---------|--------|
| Service | `aegis-compliance-worker` |
| Start | `pnpm --filter aegis-api compliance:worker` |
| Cron | `0 6 * * *` (daily 06:00 UTC) |
| Env | `DATABASE_URL`, `COMPLIANCE_EXPORT_DIR` (volume path) |

Processes scheduled export jobs and due monthly schedules.

### 3. Housekeeping (hourly cron)

| Setting | Value |
|---------|--------|
| Service | `aegis-housekeeping` |
| Start | `pnpm --filter aegis-api maintenance:housekeeping` |
| Cron | `0 * * * *` (hourly) |
| Env | `DATABASE_URL` |

Expires stale approvals and closes orphaned RUNNING traces.

### Platform Ops: worker run history

After migration 026, platform admins see all runs at **Platform Ops → Workers** (`ops.salanor.com/workers`).

Each witness tick, compliance run, and housekeeping run is stored in `worker_run` with status, duration, and summary JSON.

## Also check

- Settings → **Source**: repo `lan-dry/xyz`, branch `main`
- **Wait for CI** off unless you have required checks
- Watch paths include `services/aegis-api/**` and `packages/**` (platform-auth)

## After deploy

Re-run n8n **Record in Aegis**. Trace should be **COMPLETED** with LLM + tool events packed from the body — not only `trace.start`.
