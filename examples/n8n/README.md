# Aegis + n8n (long-term)

## Product rule

1. **Check Policy** before any risky side effect (block with reason).
2. **Record Run** once at the end (signed proof of the whole run).
3. Do **not** call Aegis on every harmless node.

## Packages

| Path | Purpose |
|------|---------|
| `integrations/n8n-nodes-salanor-aegis` | Community node (Record + Check Policy) |
| `examples/n8n/aegis-workflow-bridge.json` | One Record HTTP node (simple) |
| `examples/n8n/aegis-policy-then-record.json` | Policy gate + Record (HTTP, works today) |
| `examples/n8n/RAILWAY_GET_LATEST_DEPLOY.md` | How to ship latest API when Redeploy is wrong |

## Railway

**⋯ → Redeploy** rebuilds the *old* commit. Use **Settings → Source → disconnect/reconnect `main`** so a *new* deployment appears. See `RAILWAY_GET_LATEST_DEPLOY.md`.

## Env (n8n)

```
AEGIS_API_URL=https://api.salanor.com
AEGIS_ORGANIZATION_ID=…
AEGIS_AGENT_ID=…
```

Header Auth: `Authorization: Bearer aegis_…`
