# Bank-core stub

Minimal stand-in for a bank core that submits loan / payment events to Aegis and respects `allow` | `hold` | `stop`.

## Patterns

1. **Synchronous API** — `POST /v1/aegis/bank/events` with ingest API key; block or proceed on outcome.
2. **Webhook** — Aegis posts decision webhooks (HMAC) when configured; bank core updates case state.
3. **Batch import** — CSV/JSONL via mapping file in record-only mode (see `services/aegis-api/src/bank/batch-import.ts`).

## Run (conceptual)

```powershell
$env:AEGIS_API_BASE="http://localhost:8080"
$env:AEGIS_INGEST_KEY="..."
pnpm --filter @salanor/bank-core-stub start
```

Package scripts land with the TypeScript stub in `src/`.
