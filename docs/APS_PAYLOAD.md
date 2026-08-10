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

Both require `amount_usd` (or `amount`) in the payload at ingest/evaluate time.

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
