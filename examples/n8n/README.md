# Aegis n8n starter workflow

Import `aegis-workflow-bridge.json` into n8n:

1. Set env `AEGIS_API_URL` (e.g. `https://api.salanor.com`)
2. Create Header Auth credential: `Authorization: Bearer <ingest_api_key>`
3. In Console → Agents → **Enable Workflow Bridge**
4. Execute the workflow
5. Open `trace_url` from the Summary node

Full guide: `docs/AEGIS_N8N_INTEGRATION.md`
