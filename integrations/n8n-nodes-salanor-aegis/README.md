# Salanor Aegis for n8n

n8n community node for Salanor Aegis: check policy before risky steps and record signed workflow traces.

## Install

### Self-hosted / desktop

1. n8n → **Settings** → **Community nodes** → **Install**
2. Package: `n8n-nodes-salanor-aegis`
3. Accept the risk checkbox → **Install**
4. Restart n8n if asked
5. Search the palette for **Salanor Aegis**

### Docker

```bash
mkdir -p ~/.n8n/nodes
cd ~/.n8n/nodes
npm i n8n-nodes-salanor-aegis
# restart n8n
```

## Salanor setup (once)

1. [Console](https://app.salanor.com) → **API keys** → create an ingest key
2. **Agents** → enable **Workflow Bridge**
3. In n8n, add credential **Salanor Aegis API**:
   - Base URL: `https://api.salanor.com`
   - Ingest API key: `aegis_…`

## How to place nodes (keep it simple)

You do **not** put Salanor on every step.

| Where | Operation | Why |
|-------|-----------|-----|
| Before a **risky** step (pay, delete, send, refund) | **Check Policy** | Blocks the action when policy says deny, and **writes a signed audit trace** (who / tool / rule / reason) |
| End of the happy path | **Record Run** (status Completed) | One signed trace of the finished run |
| **Error Trigger** path | **Record Run** (status Failed) | Crashes still leave a signed trace |

```
Trigger
  → normal work
  → Check Policy (tool = app.payments.transfer)   # only before risk
  → Payment node
  → …
  → Record Run (Completed)

Error Trigger
  → Record Run (Failed)
```

**Tool name:** pick a stable string (e.g. `app.payments.transfer`) and use the **same** string in Console → **Policies**.

## License

MIT
