# Smoke test — all three paths

Run these **after** installing `n8n-nodes-salanor-aegis@1.0.3+` and enabling **Workflow Bridge** on your agent.

## Setup (once)

1. Credential **Salanor Aegis API** on **every** Salanor node (including **Record Run (Failed)** on the Error Trigger path).
2. In Console → **Policies**, create rules for `app.payments.transfer`:
   - **allow** — happy path
   - **deny** — block path
   - **require approval** — obligation path

Only one of these should be **active** at a time (activate the draft you want to test).

**Settings → Governance:** configure approval TTL, Slack/PagerDuty/SMS notifications, and stale trace cleanup.

---

## 1. Allow → one COMPLETED trace

1. Activate policy: `app.payments.transfer` → **allow**
2. Run workflow from **Manual Trigger**
3. Expect:
   - Check Policy output: `decision: allow`, `recorded: false`
   - Record Run output: one `trace_url`
   - Console → Traces: **one new COMPLETED** trace (policy gate embedded, not a second trace)

---

## 2. Deny → one FAILED trace

1. Activate policy: `app.payments.transfer` → **deny**
2. Run from **Manual Trigger**
3. Expect:
   - Workflow **stops** at Check Policy with policy denied error
   - Console → Traces: **one new FAILED** trace
   - DENIED column: **1** (not 2)

---

## 3. Require approval → blocked trace + Approvals inbox

1. Activate policy: `app.payments.transfer` → **require approval**
2. The example workflow includes **Request context** (Set node) with `amount_usd`, `recipient`, and `summary` so approvers see details in Console
3. Run from **Manual Trigger**
4. Expect:
   - Check Policy **waits** (polls every 5s, up to 5 min in node settings; approval itself expires after **24h**)
   - Console → Approvals: **1 pending** with request details
   - Email to org admins (if `RESEND_API_KEY` configured)
   - Console → Traces: **one BLOCKED** trace (filter Status → blocked)
5. Approve in Console → workflow continues → Record Run completes **same trace** as COMPLETED
6. History tab shows **who approved** and when; trace timeline includes signed `human_approval` event

---

## 4. Amount limit → require approval

1. Create draft: rule type **Max per transaction**, tool `app.payments.transfer`, limit `$1000`, **When limit exceeded → Require approval**
2. Activate
3. **Required in n8n:** wire **Manual Trigger → Request context → Check Policy** (not Manual Trigger → Check Policy directly). The Set node must define `amount_usd` (e.g. `2500`), `recipient`, and `summary`.
4. Run workflow
5. Expect: blocked trace, Approvals inbox shows **$2,500 USD** and recipient, formatted email includes amount

---

## 5. Error Trigger → one FAILED trace (crash path)

This is **not** the same as policy deny. It records when the workflow crashes.

1. Add a node that throws after Check Policy (e.g. **Code** node: `throw new Error('test')`), **or** use **Execute workflow from Error Trigger** with credentials set on **Record Run (Failed)**.
2. **Important:** open **Record Run (Failed)** → set the same **Salanor Aegis API** credential. Imported workflows do not copy credential bindings automatically.
3. Expect: Console → Traces: **one new FAILED** trace from Record Run (Failed), not from Check Policy.

---

## Stale RUNNING traces

Old runs from before v1.0.2 may show **RUNNING** forever. They are orphan sessions, not bugs in the new path. Filter them out or ignore; new runs should end COMPLETED, FAILED, or BLOCKED.
