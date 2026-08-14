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

**Manual Trigger** does **not** invoke the error workflow (n8n limitation). Use the **Webhook (production run)** node instead (see below).

### 3. Publish the workflow (required for error-workflow tests)

You are on **n8n 2.x** — there is **no Active/Inactive toggle**. **Publish = activate.**

1. Open the main workflow on the **Editor** tab.
2. Top-right: click the blue **Publish** button (next to `0 / 1`).
3. Confirm the publish dialog. When live, the button shows **Published** with a green indicator.
4. To turn off later: **⋯ menu → Unpublish**.

Save alone does **not** make triggers live. You must **Publish**.

The error-handler workflow does **not** need to be published.

### 4. Fast production test (webhook — seconds, not minutes)

Re-import the latest `jmt-s-content-sync-with-aegis.json` if you do not see **Webhook (production run)** on the canvas (left side, below Manual Trigger).

1. **Publish** the main workflow (step above).
2. Open **Webhook (production run)** → copy the **Production URL** (not Test URL).  
   Local example: `http://localhost:5678/webhook/jmts-content-sync-run`
3. Trigger once — **copy Production URL from the Webhook node** (do not guess the path):

```bash
curl -X POST "PASTE_PRODUCTION_URL_FROM_NODE_HERE"
```

Local paths vary by n8n version. Examples:
- `http://localhost:5678/webhook/jmts-content-sync-run`
- `http://localhost:5678/webhook/<workflow-id>/jmts-content-sync-run`

4. Approve in Console when 7b pauses.
5. Check **Executions**: main run + **Aegis error handler** if a node failed.

#### Webhook 404 or "(disabled)" on canvas?

1. Click **Webhook (production run)** — if the node says **disabled**, right-click the node → **Enable** (or use the node menu ⋮ → Enable).
2. **Publish** again after enabling.
3. Use the **Production URL** tab in the node (not **Test URL** / `webhook-test`).
4. `curl -X POST` the Production URL.

**Do not use `webhook-test`** for error-workflow tests — test mode does not run the Error Workflow. Test URL only works once after **Listen for test event**.

#### Webhook 404 after Publish (node enabled)?

n8n 2.x often shows **Published** but the webhook is **not registered** (known bug).

1. **Unpublish** (⋯ menu).
2. Nudge any node (move 1px) so the canvas is "dirty".
3. **Publish** again.
4. Open **Webhook (production run)** → copy the **Production URL** shown in the node panel.
5. `curl -X POST` that exact URL (POST only, not GET).

If it still 404s: restart the n8n container/process, then Publish again.

**Do not** use “every 1 minute” schedule for failure tests. Webhook = one shot, instant.

| Trigger | Happy-path demo | Error workflow test |
|---------|-----------------|---------------------|
| Manual Trigger | Yes | No |
| Webhook (workflow **Published**) | Yes | Yes |
| Daily schedule | Yes | Yes (slow) |

### 5. Credentials

| Credential | Used on | Purpose |
|------------|---------|---------|
| **Salanor Aegis API** | **7b**, **11**, error handler **Record failure** | Check Policy + Record Run |
| **Header Auth** (same ingest key) | error handler **Lookup open trace** | Find open trace by n8n execution id |
| **JMT-S Agent API Header Auth** | **1, 6, 8**, extract nodes | JMT-S CMS API |

On the error handler **Lookup open trace** node, create Header Auth with header name `Authorization` and value `Bearer <your ingest key>` (same key as Salanor Aegis API).

### 6. Aegis console

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
