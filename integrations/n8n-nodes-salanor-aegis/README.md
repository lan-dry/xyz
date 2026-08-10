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
| Before a **risky** step (pay, delete, send, refund) | **Check Policy** | Blocks on deny; pauses on require approval; allow folds into Record Run |
| End of the happy path | **Record Run** (status Completed) | **One** signed trace for the whole run |
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

### One trace per run

- **Allow:** Check Policy does not write a trace. Record Run writes **one** COMPLETED trace (policy gate step is embedded).
- **Deny:** Check Policy writes **one** FAILED trace and stops the workflow.
- **Require approval:** Check Policy opens **one** blocked trace + approval link, waits for Console approval, then Record Run completes that same trace.

**Tool name:** pick a stable string (e.g. `app.payments.transfer`) and use the **same** string in Console → **Policies** (decision: allow, deny, or **require approval**).

## Example workflow

Import `examples/smoke-test-with-error-trigger.json`, then:

1. Replace `YOUR_ORG_ID` / `YOUR_AGENT_ID` on **Check Policy**
2. Assign **Salanor Aegis API** credential on **both** Salanor nodes:
   - **Record Run** (happy path)
   - **Record Run (Failed)** (Error Trigger path) ← easy to miss
3. Follow `examples/SMOKE_TEST.md` for allow, deny, and require-approval runs

## License

MIT
