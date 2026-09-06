# APS event payload conventions (provenance)

Agents should populate `tool_name` and a structured `payload` so the console can show **what happened, through which vendor, for how much, and why**.

## Recommended `payload` fields

| Field | Example | Purpose |
|-------|---------|---------|
| `span_id` | `spn_01J8K2…` | Groups steps in the console trace view (use `newSpanId()` from SDK) |
| `span_label` | `LLM triage` | Human-readable span title |
| `provider` | `stripe`, `openai` | Vendor that executed the action |
| `action` | `payment_intent.create` | Human-readable action |
| `amount_usd` | `1999.50` | Numeric amount for policy limits |
| `currency` | `USD` | Display |
| `trigger_source` | `trello`, `google_calendar` | Upstream system that caused the agent to act |
| `trigger_detail` | `Task "Pay vendor" completed` | Context for auditors |
| `transaction_id` | `pi_3abc…` | Correlation to vendor dashboards |
| `resource_id` | `inv_123` | Secondary correlation |

## Policy limits

Policies can enforce:

- **`max_per_tx`** — `conditions: { "rule_type": "max_per_tx", "max_amount_usd": 10000 }`
- **`max_daily_total`** — same + `window_hours` (default 24) to catch repeated $2k transfers
- **`when`** (optional) — limit applies only when context matches, e.g. `{ "when": { "segment": "VIP" } }`
- **`blocked_beneficiary`** — `conditions: { "rule_type": "blocked_beneficiary", "blocked_beneficiaries": ["ACME"] }`

Both amount rules require `amount_usd` (or `amount`) in the payload at ingest/evaluate time (top-level or under `request_payload`).

Context fields for `when`: `segment`, `account_type`, `beneficiary` (also reads `recipient`, `client_segment`, etc.).

## Human approval preview (send these in workflow payload)

When a rule returns `allow_with_obligation`, approvers see fields from the policy gate event. Put business context in the payload **before** evaluate/ingest (n8n **Request context** Set node, or SDK `auditPayload`).

| Field | Example | Shown in Console |
|-------|---------|------------------|
| `summary` | `Wire to ACME Corp · invoice #8842` | Approval card title / detail |
| `amount_usd` | `2500` | Amount line |
| `amount` | `2500` | Fallback if `amount_usd` missing |
| `currency` | `USD` | Display |
| `recipient` | `ACME Corp` | Payee / beneficiary |
| `beneficiary` | `ACME Corp` | Same; used by `blocked_beneficiary` rules |
| `segment` | `VIP`, `retail` | Context + `when` rules |
| `account_type` | `corporate`, `retail` | Context + `when` rules |
| `request_payload` | `{ "amount_usd": 2500, "segment": "VIP" }` | Nested copy for bridge workflows |

**Minimum for a credible demo:** `summary`, `amount_usd`, `recipient` (or `beneficiary`).

### n8n + approval TTL

Default **approval TTL** and **stale trace** windows are **24 hours** (Console → Settings → Governance). n8n **Wait for Approval** / workflow timeout should be **≥ approval TTL** (e.g. 86400 seconds) so the workflow does not fail while the approval is still valid. If n8n times out first, the run fails even though Aegis still shows a pending approval.

## Example

```json
{
  "tool_name": "stripe.paymentIntents.create",
  "payload": {
    "provider": "stripe",
    "action": "create_payment_intent",
    "amount_usd": 1500,
    "currency": "USD",
    "trigger_source": "trello",
    "trigger_detail": "Card moved to Done on board Ops",
    "transaction_id": "pi_3Nxxx"
  }
}
```
