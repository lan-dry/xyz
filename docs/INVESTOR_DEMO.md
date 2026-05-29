# Investor demo — why Aegis matters (beyond blocking)

Most AI runs **without** an incident. Prospects say: *“We’ve never lost money — why do we need this?”*

Aegis value is **three layers**. Blocking is only one.

## 1. Visibility (always on — even when nothing is denied)

Every signed event answers questions finance, legal, and security ask **after** something goes wrong — or during an audit:

| Question | Where in Aegis |
|----------|----------------|
| What customer data did the model see? | `llm_invocation` → `data_touched` |
| Which model step led to a payment attempt? | Trace timeline + `parent_event_id` |
| Can we prove this to a regulator? | Signed chain + export bundles |
| Who configured the policy that allowed/denied? | Policy ID on `policy_decision` |

**Console:** Dashboard → **Why this matters** panel (org-wide). Trace detail → same panel per workflow.

## 2. Control (policy + human loop)

| Mode | When |
|------|------|
| **Deny** | Stop tool before HTTP (demo: Stripe refund) |
| **Allow** | Record that money moved under an explicit policy |
| **Allow with obligation** | Queue for human approval |

Most production traffic may be **allow** — Aegis still records *who, what, how much, why*.

## 3. Prevention (when you need it)

The pilot **blocks** `$249` on `stripe.paymentIntents.create` to show loss prevention in one trace. Use it as the *hook*, not the whole product.

---

## Run the demo

```bash
pnpm db:migrate          # required after pull (email verification, etc.)
pnpm dev
pnpm pilot:ensure-policy
pnpm pilot:agent
```

Open the printed trace URL → **Why this matters** at top → drill into events.

## Talk track (60 seconds)

> “Your support AI read email, order ID, and refund amount — we signed that.  
> It then tried to pay $249 — policy blocked it.  
> Even on a normal day with no block, you’d still get the PII map and model audit trail for SOC 2 and EU AI Act.  
> Blocking is the emergency brake; the ledger is why you buy the car.”

## Personas

**CFO / risk:** Exposure metrics on dashboard; denied vs allowed financial tools; exportable evidence.

**Engineering:** `signAndIngest` (LLM) + `wrapFetch` (tools) — minimal SDK surface.

**Compliance:** `data_classification`, `data_touched`, immutable chain — not screenshots of ChatGPT.

## Related

- [PILOT_WALKTHROUGH.md](./PILOT_WALKTHROUGH.md)
- Reference app: `apps/pilot-agent/`
