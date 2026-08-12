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

### Aegis — Workflow Bridge

1. Console → **API keys** → ingest key
2. Console → **Agents** → **Enable Workflow Bridge**
3. n8n credential **Salanor Aegis API** on **7b**, **11**, and **E2** (same ingest key on all three Salanor nodes)

### Credentials (do not mix these up)

| n8n credential | Used on | Purpose |
|----------------|---------|---------|
| **Salanor Aegis API** | **7b**, **11**, **E2** | Check Policy, Record Run, record failure |
| **JMT-S Agent API Header Auth** (your "Authorization JMT-S API") | **1, 6, 8**, extract nodes | Calls to JMT-S CMS API |

Node **11** uses the **Salanor Aegis** community node (Record Run), not a separate Header Auth credential. You can delete **Auth Aegis** after re-import if nothing else in n8n still references it.

**Do not** use the Aegis ingest key on node **8**. Node 8 talks to JMT-S (`/api/agent/v1/content/apply`), not Salanor Aegis.

### Error path (governed)

If publish fails after approval (bad credentials on node 8, HTTP error, etc.):

1. **Node 8 error output** → **E1 → E2** closes the obligation trace as **FAILED** (works on **Manual Trigger** runs).
2. **Error Trigger** → E1 → E2 is a backup for **production** runs only (n8n does not fire Error Trigger on manual test executions).

When Check Policy (7b) created an obligation trace, node **11** completes that same trace via `/workflows/runs/{trace_id}/complete` instead of starting a new one-shot run.

Re-import after updates: `node examples/n8n/build-jmts-aegis.mjs`

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
