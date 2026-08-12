# JMT-S Content Sync + Aegis

## Which file to import?

| Workflow | File | Use when |
|----------|------|----------|
| **Governed (default)** | `jmt-s-content-sync-with-aegis.json` | Sales demos & production — publish requires Console approval |
| Audit only | `jmt-s-content-sync-with-aegis-audit.json` | Dry-run validation + signed trace, no live CMS publish |

Both live in `examples/n8n/` (canonical). Regenerate after editing the base workflow:

```bash
node examples/n8n/build-jmts-aegis.mjs
```

---

## One-time setup

### JMT-S + OpenAI (same as base workflow)

- `JMTS_API_BASE_URL`, `GOOGLE_DRIVE_FOLDER_ID` (or file ID)
- Credentials: JMT-S Agent API, OpenAI, Google Drive

### Aegis — Workflow Bridge (node 11)

1. Console → **API keys** → ingest key
2. Console → **Agents** → **Enable Workflow Bridge**
3. n8n env: `AEGIS_API_URL=https://api.salanor.com`
4. Credential **Aegis Ingest API — Header Auth** on node **11. Record in Aegis**

### Aegis — Policy gate (governed workflow only, node 7b)

1. Console → **Policies** → create draft:
   - **Tool pattern:** `jmts.content.publish`
   - **Decision:** require approval
   - **Activate** the draft
2. n8n credential **Salanor Aegis API** on node **7b. Check Policy (publish)**
3. Set **Organization ID** and **Agent ID** on that node (Console → Settings → Organization, Agents page)

Optional: create a separate **allow** policy for `jmts.content.apply` (dry-run) so only publish is gated.

---

## Flow (governed)

```
… → OpenAI diff → Apply dry-run → Publishable updates?
  → yes → Publish context → Check Policy (publish) → Apply publish → Summary → Record in Aegis
  → no  → Summary → Record in Aegis
```

**No `JMTS_AUTO_PUBLISH` env var.** Live publish always goes through policy when updates exist.

---

## Demo run (5 minutes)

1. Import **governed** workflow, wire credentials and org/agent IDs on node 7b
2. Activate policy `jmts.content.publish` → require approval
3. **Manual Trigger** in n8n
4. Workflow **pauses** at Check Policy → Console → **Approvals** → approve
5. Publish completes → node 11 returns `trace_url`
6. Console → **Traces** → COMPLETED → **Replay** → **Verify chain + inclusion**

See `DEMO_SCRIPT.md` for the spoken 60-second script.

---

## After a run

- **Traces:** COMPLETED with LLM + apply + (if approved) publish steps
- **Approvals → History:** who approved, when
- **Exports:** auditor bundle when scheduled exports are active on your plan
