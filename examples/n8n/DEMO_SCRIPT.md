# Aegis live demo script (60 seconds + extended)

Use the **governed** JMT-S workflow and a fresh manual run.

## 60-second version

| Time | Say | Show |
|------|-----|------|
| 0–8s | "This n8n workflow reads Google Drive, asks OpenAI what to change on the website, and can publish to production. Most teams can't answer: who authorized that publish?" | n8n canvas |
| 8–18s | "Before publish runs, Aegis checks policy. If your rule says require approval, the workflow stops until a named person approves in Console." | Run workflow → pauses at **7b. Check Policy** |
| 18–28s | "Here's the obligation: update count, summary, waiting in Approvals—not a Slack thread lost in history." | Console → **Approvals** → pending item |
| 28–35s | "I approve. Publish runs. One node at the end records the full run as a signed trace." | Approve → n8n completes → **11. Record in Aegis** output |
| 35–48s | "Five signed events: session, LLM, dry-run apply, publish, close. Replay is the causal chain auditors ask for." | Trace → **Replay** |
| 48–55s | "Verify isn't trust-us—Ed25519 chain plus Merkle inclusion on our ledger." | Event → **Verify chain + inclusion** → Valid |
| 55–60s | "When legal asks who approved Tuesday's CMS changes—you open this, not log grep." | Trace URL |

---

## Failure path (optional, 30s)

Use the **production webhook** (`POST /webhook/jmts-content-sync-run`), not Manual Trigger. n8n Error Workflow only runs on published production executions.

| Step | Show |
|------|------|
| Trigger webhook run → approve | Obligation clears, publish node fails (e.g. auth) |
| Error handler workflow | Separate canvas — lookup trace → record failure |
| Console trace | **FAILED** with provenance on the failing step |

Say: "Success and failure both land as signed traces. Auditors get a complete picture."

---

## Extended demo (10 minutes)

1. **Dashboard** — Ledger witness OK, verification batches (trust signal)
2. **Policies** — show `jmts.content.publish` → require approval (governance)
3. **Run workflow** — block at policy gate
4. **Approvals** — approve with context visible
5. **Traces** — COMPLETED, expandable timeline
6. **Replay** — step through LLM → apply → publish
7. **Verify** — chain + inclusion on publish event
8. **Exports** — "This bundle is what SOC 2 / EU AI Act samples look like"
9. **Trust page** (marketing) — leave-behind at `salanor.com/trust`

---

## Before/after one-liner

**Without Aegis:** n8n execution log + OpenAI dashboard + hope.  
**With Aegis:** signed trace, named approver, cryptographic verify, export for auditors.

---

## Objection handles

| Objection | Response |
|-----------|----------|
| "We already log in n8n" | "Logs aren't signed, aren't policy-gated, and don't prove who approved a side effect." |
| "We use LangSmith" | "Great for model debugging. Aegis is for governance: policy, approval, tamper-evident audit." |
| "Too much setup" | "One policy, one Check Policy node, one Record node. You ran it this morning." |
