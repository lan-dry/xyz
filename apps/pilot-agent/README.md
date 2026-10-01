# Pilot agent — reference client using `@salanor/aegis`

Runs the support-refund demo against **your real Console org** (same env vars as `examples/governance-bridge-node`).

## 1. Console setup

With `pnpm dev` running, open **http://localhost:3000** and sign in to your organization.

| `.env` variable | Where in Console |
|-----------------|------------------|
| `AEGIS_ORGANIZATION_ID` | **Settings → Organization** → Organization ID |
| `AEGIS_AGENT_ID`, `AEGIS_KEY_ID`, `AEGIS_SIGNING_PRIVATE_KEY_B64` | **Agents → Create agent** → copy the credentials JSON (`private_key_b64` → `AEGIS_SIGNING_PRIVATE_KEY_B64`) |
| `AEGIS_INGEST_API_KEY` | **API keys → Create key** → copy the secret (shown once) |

## 2. Root `.env`

Add the five values above plus `AEGIS_API_URL=http://127.0.0.1:8080`. See `.env.example` in this folder.

## 3. Run

```bash
pnpm pilot:ensure-policy   # adds deny rule for stripe.paymentIntents.create on your org
pnpm pilot:agent
```

Package: `@salanor/aegis` (workspace `sdks/typescript`).
