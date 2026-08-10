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

## Also check

- Settings → **Source**: repo `lan-dry/xyz`, branch `main`
- **Wait for CI** off unless you have required checks
- Watch paths include `services/aegis-api/**` and `packages/**` (platform-auth)

## After deploy

Re-run n8n **Record in Aegis**. Trace should be **COMPLETED** with LLM + tool events packed from the body — not only `trace.start`.
