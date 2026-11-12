# Sensitive action → Aegis receipt

One integration pattern for any sensitive operation. Your system records what happened; Aegis seals it and shows a receipt a non-technical person can read.

The loan file is only a sample. The same shape works for payments, data access, KYC, and other governed steps.

## What you send

A single JSON object:

| Field | Purpose |
|-------|---------|
| `action` | What was attempted |
| `resource` | What was touched |
| `fields_accessed` | Fields the system actually saw |
| `policy.id` / `policy.reason` | Rule label and plain-language reason (stored on the receipt; need not be a live console policy row) |
| `outcome` | `allowed`, `paused`, or `blocked` |
| `approval` | Whether a person decided (optional) |
| `summary` | One line for the receipt |

`context` is optional. Put domain details there (loan id, payment id, …). The pattern does not require them.

## What Aegis seals

Each JSON file becomes a short signed case:

1. **Data access** — the field list  
2. **Policy decision** — the rule and outcome  
3. **Human approval** — only when `approval.required` is true  
4. **Case complete** — closes the receipt  

The console receipt answers: what happened, what data was seen, which rule applied, and whether a person approved.

## Connect an existing system

1. In the Aegis console, create an agent and an ingest API key. Copy the signing private key once when the agent is created.
2. Copy `.env.example` to `.env` and fill `AEGIS_*` values.
3. From your service (core banking, orchestration, batch job, n8n, …), after a sensitive step finishes, build the JSON above and either:
   - call this helper (`pnpm send -- path/to/action.json`), or  
   - POST the same story through the [Workflow Bridge capture API](../../docs/AEGIS_N8N_INTEGRATION.md) if you do not want signing keys in the client.
4. Open the printed receipt URL (or Live feed) to confirm the sealed case.

Minimum credentials:

```
AEGIS_API_URL
AEGIS_INGEST_API_KEY
AEGIS_ORGANIZATION_ID
AEGIS_AGENT_ID
AEGIS_KEY_ID
AEGIS_SIGNING_PRIVATE_KEY_B64
```

## Try the loan sample

```bash
cd examples/sensitive-action
pnpm install
cp .env.example .env   # fill credentials

# Local preview — no API call
pnpm preview -- examples/loan-decision.json

# Sign and ingest into Aegis
pnpm send:loan
```

## Add another example

1. Copy `examples/_template.json` (or `payment-transfer.json`).
2. Fill `action`, `fields_accessed`, `policy`, `outcome`, and `summary`.
3. Preview, then send:

```bash
pnpm preview -- examples/your-case.json
pnpm send -- examples/your-case.json
```

## Outcomes

| Your `outcome` | Meaning on the receipt |
|----------------|------------------------|
| `allowed` | Completed under the rule |
| `paused` | Needs a person (or was approved/declined after pause) |
| `blocked` | Stopped by the rule |
