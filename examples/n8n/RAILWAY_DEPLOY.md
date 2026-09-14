# Force-deploy aegis-api on Railway

## Why you see “no new deployment”

GitHub `main` has newer commits (e.g. `1c91171`), but Railway **aegis-api** may still show:

`feat: Workflow Bridge for n8n…`

That old build **only starts** a trace. It ignores `one_shot` / `execution`, so n8n returns `status: "running"` with **1 event** (`aegis.trace.start`).

Auto-deploy is off, filtered, or not reconnecting.

## Fix (manual Deploy)

1. Railway → **Salanor** → **aegis-api**
2. Deployments → **⋯** → **Deploy** latest from branch **`main`**
3. Active commit must **not** be only the old “feat: Workflow Bridge…” — look for `one-shot` / `1c91171` / `a9ef3ee`
4. After ACTIVE, logs should print: `aegis-api listening … (2026-08-06-one-shot-runs-v2)`

## Verify

With a real ingest key, `POST /v1/aegis/workflows/runs` + body with `one_shot: true` and `execution.nodes` must return **`status: "completed"`**, not `running`.
