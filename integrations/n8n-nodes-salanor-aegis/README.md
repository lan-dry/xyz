# Salanor Aegis for n8n

Official community node: **signed traces + policy checks** without Ed25519 keys in n8n.

## How customers install (this is the product)

### Self-hosted / desktop n8n

1. Open n8n → **Settings** → **Community nodes** → **Install**
2. Package name: `n8n-nodes-salanor-aegis`
3. Accept the risk checkbox → **Install**
4. Restart n8n if prompted
5. Search the node palette for **Salanor Aegis** (Salanor icon)

### Docker / queue mode

```bash
mkdir -p ~/.n8n/nodes
cd ~/.n8n/nodes
npm i n8n-nodes-salanor-aegis
# restart n8n
```

### n8n Cloud

Install the same package name under Community nodes when your Cloud plan allows community packages. If Cloud blocks unverified packages, use the HTTP one-shot API until the package is listed/verified.

### One-time Salanor setup

1. Console → **API keys** → create ingest key  
2. Console → **Agents** → **Enable Workflow Bridge** (shows **Workflow Bridge on**)  
3. In n8n: create credential **Salanor Aegis API**  
   - Base URL: `https://api.salanor.com`  
   - Ingest API key: `aegis_…`

## How to use in a workflow

```
Trigger
  → your existing nodes
  → [Salanor Aegis · Check Policy]   # only before risky tools
  → risky tool (if allowed)
  → …
  → [Salanor Aegis · Record Run]     # once at the end
```

| Operation | When | Effect |
|-----------|------|--------|
| **Record Run** | End of workflow | One call → full signed APS-1 trace + `trace_url` |
| **Check Policy** | Before side effects | Deny can **stop** the workflow with a reason |

**Record Run** packs the incoming item automatically (and `sample_llm` / `sample_tool` if present). Optional **Steps** JSON for explicit LLM/tool rows.

## Zapier / Make / other orchestrators

There is no n8n-style community node. Use the same API:

`POST https://api.salanor.com/v1/aegis/workflows/runs`  
with ingest Bearer key and body `{ one_shot: true, execution: { nodes: […] }, status: "completed" }`.

## Publish (Salanor ops)

Package must be on the **public npm registry** for the install UI above to work:

```bash
cd integrations/n8n-nodes-salanor-aegis
npm login          # or NPM_TOKEN
npm run build
npm publish --access public
```

Or GitHub Action **Publish n8n-nodes-salanor-aegis** with secret `NPM_TOKEN`.

## License

MIT
