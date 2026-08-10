# Aegis Workflow Bridge — n8n / Zapier / Make

**Goal:** full signed, expandable, replayable traces with **almost no work** in the orchestrator.

You do **not** call Aegis on every node.  
You do **not** put Ed25519 private keys in n8n.  
You add **one HTTP node** at the end (`POST /workflows/runs/capture`). Salanor starts, signs steps, and closes the trace server-side.

---

## What buyers see

A complete run in Aegis Console:

1. Trace open (workflow started)
2. Expandable steps (LLM, tools, decisions, data access) — packed once at the end
3. Provenance claim (workflow closed)
4. Replay + export + SIEM forwarding like any other APS-1 trace

---

## One-time setup (5 minutes)

### A. Salanor Console

1. Create an **ingest API key** (Settings → API keys). Copy the secret.
2. Open **Agents** → pick (or create) an agent → click **Enable Workflow Bridge**.
3. Salanor generates a server-held signing key (encrypted at rest). You never see the private key.

### B. aegis-api env (Salanor ops)

```bash
# 32-byte secret — required for Workflow Bridge encryption
AEGIS_BRIDGE_MASTER_KEY=<random-base64-or-hex-or-passphrase>
# Optional: deep links in API responses
CONSOLE_PUBLIC_URL=https://app.salanor.com
```

Run migration `023_workflow_bridge`.

### C. n8n credential (once)

Create **Header Auth**:

| Field | Value |
|-------|--------|
| Name | `Authorization` |
| Value | `Bearer aegis_…` (your ingest API key) |

Store `AEGIS_API_URL` in n8n env (e.g. `https://api.salanor.com`).

---

## Per-workflow pattern (least effort)

```
Trigger
  → … your existing nodes unchanged …
  → Record in Aegis   ← one HTTP POST /v1/aegis/workflows/runs/capture
```

Map LLM / tool previews in that single request body. **No Start node. No Complete node.**

Import the starter: `examples/n8n/aegis-workflow-bridge.json`

True zero-touch (auto-instrument every native n8n node with no HTTP node) needs a future community node / error-workflow hook — not available today without that package.

---

## API reference

Base: `{AEGIS_API_URL}/v1/aegis`  
Auth: `Authorization: Bearer <ingest_api_key>`

### 1. Capture run (preferred — one call)

`POST /workflows/runs/capture`

```json
{
  "business_context": "Content sync from Drive",
  "external_system": "n8n",
  "external_workflow_id": "{{ $workflow.id }}",
  "external_execution_id": "{{ $execution.id }}",
  "status": "completed",
  "summary": "Dry-run OK; 4 CMS updates validated",
  "execution": {
    "workflow_name": "Content Sync",
    "execution_id": "{{ $execution.id }}",
    "nodes": [
      {
        "name": "OpenAI diff",
        "kind": "llm",
        "purpose": "Propose CMS updates",
        "input_preview": "Drive docs + snapshot…",
        "output_preview": "{\"updates\":[…]}"
      },
      {
        "name": "Apply dry-run",
        "kind": "tool",
        "tool_name": "app.content.apply",
        "status": "success",
        "output_preview": "4 updates validated"
      }
    ]
  }
}
```

Response includes `trace_id`, signed `events`, and `trace_url`.

### 2. Start run (optional multi-call)

`POST /workflows/runs`

```json
{
  "business_context": "Content sync from Drive",
  "external_system": "n8n",
  "external_workflow_id": "{{ $workflow.id }}",
  "external_execution_id": "{{ $execution.id }}"
}
```

Response:

```json
{
  "trace_id": "trc_…",
  "root_event_id": "evt_…",
  "agent_id": "agt_…",
  "key_id": "key_…",
  "status": "running",
  "trace_url": "https://console…/aegis/traces/trc_…"
}
```

Save `trace_id` for Complete (n8n: `$('1. Aegis Start Trace').first().json.trace_id`).

### 3. Complete run (multi-call alternative)

`POST /workflows/runs/{trace_id}/complete`

```json
{
  "status": "completed",
  "summary": "Dry-run OK; 4 CMS updates validated",
  "execution": {
    "workflow_name": "Content Sync",
    "execution_id": "{{ $execution.id }}",
    "nodes": [
      {
        "name": "OpenAI diff",
        "kind": "llm",
        "purpose": "Propose CMS updates",
        "input_preview": "Drive docs + snapshot…",
        "output_preview": "{\"updates\":[…]}"
      },
      {
        "name": "Apply dry-run",
        "kind": "tool",
        "tool_name": "app.content.apply",
        "status": "success",
        "output_preview": "4 updates validated"
      }
    ]
  }
}
```

Salanor expands `nodes` into signed APS events (`llm_invocation`, `tool_call`, …) then closes with a provenance claim.

### 4. Optional: mid-run steps

`POST /workflows/runs/{trace_id}/steps` — only if you need live policy / audit before a dangerous tool. Max 50 steps per call.

### 5. Status

`GET /workflows/runs/{trace_id}`

---

## Code node snippet (copy-paste)

Name the previous nodes to match (or edit the names):

```javascript
const start = $('1. Aegis Start Trace').first().json;
const openai = $('OpenAI').first().json; // rename if needed
const apply = $('Apply').first().json;   // rename if needed

const nodes = [];

if (openai) {
  nodes.push({
    name: 'OpenAI',
    kind: 'llm',
    purpose: 'Orchestrator LLM step',
    input_preview: JSON.stringify(openai).slice(0, 400),
    output_preview: JSON.stringify(openai.choices?.[0] ?? openai).slice(0, 400),
  });
}

if (apply) {
  nodes.push({
    name: 'Apply',
    kind: 'tool',
    tool_name: 'app.content.apply',
    status: apply.status ?? 'success',
    output_preview: JSON.stringify(apply).slice(0, 400),
  });
}

return [{
  json: {
    trace_id: start.trace_id,
    completeBody: {
      status: 'completed',
      summary: `Workflow finished with ${nodes.length} captured step(s)`,
      execution: {
        workflow_name: $workflow.name,
        execution_id: String($execution.id),
        nodes,
      },
    },
  },
}];
```

Then Complete HTTP body: `={{ JSON.stringify($json.completeBody) }}`  
URL: `={{ $env.AEGIS_API_URL }}/v1/aegis/workflows/runs/{{ $json.trace_id }}/complete`

---

## Error / failure path

On Error Workflow or IF fail branch:

```json
{ "status": "failed", "summary": "Apply rejected: …" }
```

Same Complete URL with the `trace_id` from Start.

---

## Security (enterprise)

| Item | Rule |
|------|------|
| Private key | Never in n8n — only on aegis-api (encrypted) |
| Auth | Ingest API key Bearer only |
| Org scope | Key is org-scoped; cannot write other orgs |
| PII | Previews truncated; avoid full secrets in `input_preview` |
| Rotation | Re-click Enable Workflow Bridge to mint a new server key |

---

## SDK vs Workflow Bridge

| Use case | Use |
|----------|-----|
| App/agent code (Node/Python) with policy before tools | `@salanor/aegis` SDK + `wrapFetch` |
| n8n / Zapier / Make | **Workflow Bridge** (this doc) |
| Both | Same org; different agents or same agent with bridge key |

---

## Checklist for a new customer workflow

- [ ] Ingest API key in n8n Header Auth
- [ ] Agent has **Workflow Bridge** enabled
- [ ] One **Record in Aegis** capture node at end (or Start/Complete if you prefer multi-call)
- [ ] Open `trace_url` in Console → verify expandable steps + replay

---

## Related

- `examples/n8n/aegis-workflow-bridge.json` — importable starter
- `docs/AEGIS_GOVERNANCE_BRIDGE_MVP.md` — SDK bridge for in-app code
- Console → Agents → Enable Workflow Bridge
