# Get Railway to run the *latest* main commit

Your **⋯ → Redeploy** only rebuilds the **same old commit**  
(`feat: Workflow Bridge…`). That is why one-shot never ships.

GitHub already has the new code (`1c91171`+). Railway’s GitHub hook is not creating new deployments.

## Option A — reconnect Source (fastest, no token)

1. Railway → **aegis-api** → **Settings** (left/top tabs — not the deployment ⋯ menu).
2. Find **Source** / **Service source** / **Connected repo**.
3. Confirm:
   - Repo: `lan-dry/xyz` (or whatever hosts this monorepo)
   - Branch: **`main`**
4. **Disconnect** the repo → **Connect** again → select **`main`**.
5. You should see a **new** deployment appear with a *new* commit message  
   (e.g. `feat: n8n community node…` or `fix: one-shot…`), **not** only Redeploy of Workflow Bridge.
6. Wait until **ACTIVE**. Check logs for:  
   `aegis-api listening … (2026-08-06-one-shot-runs-v2)`

## Option B — GitHub Action (repeatable)

1. Railway → Account → **Tokens** → create token.
2. GitHub repo → Settings → Secrets → `RAILWAY_TOKEN` (= that token).
3. Optional: `RAILWAY_SERVICE_ID` for aegis-api.
4. Actions → **Deploy aegis-api (Railway)** → **Run workflow**.

## Verify API

After a *new* commit is ACTIVE:

```bash
# with real ingest key — must return status "completed", not "running"
curl -sS -X POST https://api.salanor.com/v1/aegis/workflows/runs \
  -H "Authorization: Bearer $AEGIS_INGEST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"one_shot":true,"business_context":"probe","status":"completed","execution":{"nodes":[{"name":"probe","kind":"result"}]}}'
```
