# Aegis n8n starter

Import `aegis-workflow-bridge.json`:

1. Env `AEGIS_API_URL=https://api.salanor.com`
2. Header Auth: `Authorization: Bearer <ingest_api_key>`
3. Console → Agents → **Enable Workflow Bridge** (button becomes **Workflow Bridge on**)
4. Put your work in **Your workflow work**
5. Keep **one** HTTP node: `POST /v1/aegis/workflows/runs` with `one_shot: true` + `execution.nodes`
6. Open `trace_url` from the response

You do **not** call Aegis on every node. One record call at the end is the product standard.

Zero HTTP nodes (fully automatic) needs a future n8n community node — not available yet.
