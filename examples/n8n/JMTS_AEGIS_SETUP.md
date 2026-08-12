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

**Any node failure** (bad credentials, HTTP 500, OpenAI timeout, etc.) should close the Aegis trace as **FAILED**, not leave it stuck on EXECUTING.

n8n gives you two mechanisms:

| Mechanism | When it runs | This workflow |
|-----------|----------------|---------------|
| **Per-node error output** (`On Error → Continue → Error Output`) | Manual Trigger **and** production | **Built in:** every HTTP, Code, Set, and Drive node (except soft-fail extract) routes to **E1 → E2** |
| **Settings → Error Workflow** (separate workflow with Error Trigger) | **Production only** (active workflow, real trigger). **Not** Manual Trigger test runs. | Optional backup — import `jmt-s-aegis-error-handler.json` and link it in workflow settings |

**7b Check Policy** is excluded from the global error wire on purpose: deny/reject is already handled by Aegis (FAILED or stays blocked).

**2g JMT-S Extract text** uses Continue On Fail (soft-fail per file) and is excluded.

After **7c Store obligation trace**, the obligation `trace_id` is in workflow static data so **E1** can close the correct trace even when **7b** is not reachable from the error branch.

When Check Policy (7b) created an obligation trace, node **11** (success) or **E2** (failure) completes that same trace.

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
