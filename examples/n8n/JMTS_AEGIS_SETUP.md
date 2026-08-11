# JMT-S Content Sync + Aegis

Import **`jmt-s-content-sync-with-aegis.json`** into n8n.

## One-time setup

1. **JMT-S** — same as the base workflow (`JMTS_API_BASE_URL`, Drive folder, JMT-S Agent API credential).
2. **OpenAI** — credential on node `4. OpenAI diff`.
3. **Aegis**
   - Console → **API keys** → create ingest key.
   - Console → **Agents** → enable **Workflow Bridge** on your content-sync agent.
   - n8n env: `AEGIS_API_URL=https://api.salanor.com`
   - n8n credential **Aegis Ingest API — Header Auth**: `Authorization: Bearer aegis_…`
   - Bind credential on node **`11. Record in Aegis`**.

## What was added

```
9. Summary → 10. Prepare Aegis capture → 11. Record in Aegis
```

Node 10 packs OpenAI + dry-run apply + publish (when run) into one signed trace via Workflow Bridge.

## After a run

Open Console → **Traces**. You should see a **COMPLETED** (or **FAILED**) trace with expandable LLM and tool steps. Share the trace URL in demos.

## Optional: require approval before publish

1. Console → **Policies** → tool `jmts.content.publish` → **require approval**.
2. Add a **Check Policy** node between `7. Auto-publish?` and `8. JMT-S Apply publish` (Salanor n8n package).
3. Approvers use Console → **Approvals** before live CMS changes.

## Regenerate this file

```bash
node integrations/n8n-nodes-salanor-aegis/examples/build-jmts-aegis.mjs
```
