# JMT-S Content Sync + Aegis

## Which file to import?

| Workflow | File | Use when |
|----------|------|----------|
| **Governed (default)** | `jmt-s-content-sync-with-aegis.json` | Sales demos & production — publish requires Console approval |
| **Error handler** | `jmt-s-aegis-error-handler.json` | Import once; link from main workflow settings (see below) |
| Audit only | `jmt-s-content-sync-with-aegis-audit.json` | Dry-run validation + signed trace, no live CMS publish |

Regenerate the main workflows after editing the base:

```bash
node examples/n8n/build-jmts-aegis.mjs
```

---

## One-time setup

### 1. Import both workflows

1. Import **`jmt-s-content-sync-with-aegis.json`** (main canvas — clean, no error wires)
2. Import **`jmt-s-aegis-error-handler.json`** (small 5-node workflow)

### 2. Link the error handler (main workflow)

Open the **main** JMT-S workflow → **⋯ menu → Settings → Error Workflow** → select **Aegis error handler (JMT-S governed)**.

n8n calls this automatically when **any node fails** in a **production** run (active workflow, schedule/webhook). No extra lines on the canvas.

**Manual Trigger** test runs do **not** invoke the error workflow (n8n limitation). To test failure handling: **activate** the workflow and run via **Daily schedule** (or fix a node, wait for the schedule, then check Console → Traces → FAILED).

### 3. Credentials

| Credential | Used on | Purpose |
|------------|---------|---------|
| **Salanor Aegis API** | **7b**, **11**, error handler **Record failure** | Check Policy + Record Run |
| **Header Auth** (same ingest key) | error handler **Lookup open trace** | Find open trace by n8n execution id |
| **JMT-S Agent API Header Auth** | **1, 6, 8**, extract nodes | JMT-S CMS API |

On the error handler **Lookup open trace** node, create Header Auth with header name `Authorization` and value `Bearer <your ingest key>` (same key as Salanor Aegis API).

### 4. Aegis console

1. Console → **API keys** → ingest key
2. Console → **Agents** → **Enable Workflow Bridge**
3. **Policies** → `jmts.content.publish` → require approval → activate
4. Set **Organization ID** and **Agent ID** on node **7b**

---

## Flow (governed)

```
… → OpenAI diff → Apply dry-run → Publishable updates?
  → yes → Publish context → Check Policy (publish) → Apply publish → Summary → Record in Aegis
  → no  → Summary → Record in Aegis
```

On failure anywhere: n8n → **Error Workflow** → lookup open trace → **Record failure** → Console shows **FAILED**.

---

## Demo run (5 minutes)

1. Import both workflows; link error handler in settings
2. Wire credentials on main workflow (7b, 11) and error handler (Lookup + Record)
3. **Manual Trigger** → approve in Console → **COMPLETED** trace
4. **Replay** → verify chain

See `DEMO_SCRIPT.md` for the spoken script.

---

## After a run

- **Traces:** COMPLETED (success) or FAILED (error workflow)
- **Approvals → History:** who approved, when
- Stale **EXECUTING** rows from old test runs: housekeeping closes them after 24h
