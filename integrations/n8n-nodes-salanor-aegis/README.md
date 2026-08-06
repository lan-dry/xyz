# Salanor Aegis — n8n community node

**Long-term product path for orchestrators.**

| Operation | Place in workflow | What it does |
|-----------|-------------------|--------------|
| **Record Run** | **Once at the end** | Signed APS-1 trace (start + packed steps + complete) |
| **Check Policy** | **Before** payment / delete / send / apply | Live `allow` / `deny` / obligation — can **stop** the branch |
| Start / Complete | Advanced | Multi-call bridge |

## Requirements (honest)

- n8n **cannot** silently wrap every native node. Users place **Check Policy** before risky steps and **Record Run** at the end.
- Server must support one-shot: `POST /v1/aegis/workflows/runs` with `one_shot` + `execution` (deploy latest `main` on Railway aegis-api).
- Agent: **Workflow Bridge on** + ingest API key.

## Install (local n8n)

```bash
cd integrations/n8n-nodes-salanor-aegis
npm install
npm run build
```

**n8n desktop / self-host**

1. Settings → Community nodes → Install from npm **or**
2. Symlink / copy this package into `~/.n8n/nodes/` (or `N8N_CUSTOM_EXTENSIONS`):

```bash
# example
mkdir -p ~/.n8n/custom
npm pack
# install the tarball into n8n's custom extensions directory, then restart n8n
```

Or from n8n env:

```bash
export N8N_CUSTOM_EXTENSIONS=/absolute/path/to/integrations/n8n-nodes-salanor-aegis
```

Restart n8n. Search nodes for **Salanor Aegis**.

## Credentials

- **API Base URL:** `https://api.salanor.com`
- **Ingest API Key:** Console → API keys (`Bearer aegis_…`)

## Recommended workflow shape

```
Trigger
  → your work (LLM, tools, …)
  → [Salanor Aegis · Check Policy]   # only before dangerous tools
  → dangerous tool (if allowed)
  → … more work …
  → [Salanor Aegis · Record Run]     # once at end — pack node previews in Nodes JSON
```

## Record Run — Nodes JSON example

```json
[
  {
    "name": "OpenAI",
    "kind": "llm",
    "purpose": "Draft",
    "output_preview": "…"
  },
  {
    "name": "Apply",
    "kind": "tool",
    "tool_name": "app.content.apply",
    "status": "success",
    "output_preview": "ok"
  }
]
```

## Check Policy

Requires `organization_id`, `agent_id`, `tool_name`. On deny with default **Stop Workflow**, the run errors with the policy reason.
