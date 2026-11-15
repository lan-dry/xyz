# Example: banking-pack client stub (demo only)

**Stub** — not a production bank-core integration. Minimal stand-in that submits
events shaped for the **demo.banking** policy pack. Aegis itself is sector-neutral;
this example is banking-specific on purpose. Uses `allow` | `hold` | `stop`.

## Patterns

1. **Synchronous API** — `POST /v1/aegis/bank/events` (prefer `/governed/events`) with ingest API key; block or proceed on outcome.
2. **Webhook** — Aegis posts decision webhooks (HMAC) when configured; bank core updates case state.
3. **Batch import (stub)** — CSV/JSONL via `POST /v1/aegis/governed/events/batch` (record-only; `dry_run` defaults true). See `services/aegis-api/src/bank/batch-import.ts`.

## Run (conceptual)

```powershell
$env:AEGIS_API_BASE="http://localhost:8080"
$env:AEGIS_INGEST_KEY="..."
pnpm --filter @salanor/bank-core-stub start
```

Package scripts land with the TypeScript stub in `src/`.
