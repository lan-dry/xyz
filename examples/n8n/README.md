# Aegis n8n starter workflow

Import `aegis-workflow-bridge.json` into n8n:

1. Set env `AEGIS_API_URL` (e.g. `https://api.salanor.com`)
2. Create Header Auth credential: `Authorization: Bearer <ingest_api_key>`
3. In Console → Agents → **Enable Workflow Bridge**
4. Put your real work in **Your workflow work** (or replace that node)
5. Keep a single **Record in Aegis** HTTP node at the end (`POST …/workflows/runs/capture`)
6. Open `trace_url` from the HTTP response

You do **not** need Start + Pack + Complete. One capture call records the signed run.

Full guide: `docs/AEGIS_N8N_INTEGRATION.md`
