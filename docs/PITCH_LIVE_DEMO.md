# Live pitch demo (e.g. Thibaut) — 15 minutes

**Goal:** He leaves understanding *one sentence*: *when automation touches money or sensitive data, you can prove who decided what — and what was blocked before it ran.*

**Do not open:** Platform Ops, GitHub, migrations, marketing CMS, raw event IDs unless he asks.

Related: [PITCH_FINTECH_HUB.md](./PITCH_FINTECH_HUB.md) · [DESIGN_PARTNER_DEMO.md](./DESIGN_PARTNER_DEMO.md) · [PILOT_WALKTHROUGH.md](./PILOT_WALKTHROUGH.md)

---

## Before the call (30 min)

```powershell
# Terminal 1 — from repo root, .env with DATABASE_URL + bootstrap admin
pnpm pilot:reset          # optional: clean local DB + salanor-platform org
pnpm dev                  # wait until http://127.0.0.1:8080/health OK

# Terminal 2
pnpm pilot:ensure-policy
pnpm pilot:agent
```

Copy from JSON output:

- `console_url` → open in browser
- Confirm `payment_blocked: true`

In root `.env`, set Console credentials (see `apps/pilot-agent/README.md`): `AEGIS_INGEST_API_KEY`, `AEGIS_ORGANIZATION_ID`, `AEGIS_AGENT_ID`, `AEGIS_KEY_ID`, `AEGIS_SIGNING_PRIVATE_KEY_B64`.

**Login:** your org admin → **http://localhost:3000** (create agent + API key in Console first if needed)

**Tabs ready:**

1. **Marketing** http://localhost:3001 — only if you start with “what we do” (2 min max)
2. **Trace** — URL from `pnpm pilot:agent`
3. **Traces list** — `/aegis/traces`
4. (Optional) **Exports** — if you have a completed export

---

## Story you tell (support refund scenario)

The pilot agent simulates a **support ticket**: customer asks for a **$249 refund**. The agent reads ticket data (PII), thinks via the model, then tries to **create a Stripe payment/refund tool call**. **Policy denies it** before Stripe runs.

| Act | What he should hear | What you click |
|-----|---------------------|----------------|
| 1 — Problem | “Finance and security ask: *who authorized this refund?* Logs are not enough.” | — |
| 2 — Run | “We replay one automated support flow.” | Already ran `pnpm pilot:agent` |
| 3 — Record | “This is the **run record**, not a chat log.” | Trace page — **title is the summary line**, not the UUID |
| 4 — Summary | “**Risky action blocked**; **AI steps on record**; **data types touched**.” | Top **plain summary** cards (red = blocked tools) |
| 5 — Proof | “Each step is signed and ordered.” | **Step-through replay** — Play, pause on **deny** step |
| 6 — Tool | “Here’s the payment tool that **never executed**.” | Click deny row → event detail if needed; name `stripe.paymentIntents.create` |
| 7 — Close | “Same pattern for payout, KYC, admin access. Export for audit when they ask.” | Exports tab or mention ZIP |

**One line close:** “We’re not selling a chatbot — we sell the **receipt** for automated decisions.”

---

## If the trace looks confusing

That usually means you scrolled to the wrong layer:

| Layer | Audience | Show in pitch? |
|-------|----------|----------------|
| **Plain summary** (top) | Thibaut, risk, compliance | **Yes — spend 80% of time here** |
| **Timeline / spans** | Engineers | Only if he’s technical: “here’s the ordered steps” |
| **Flat event table** | Debugging | **No** — collapsed “All events” |
| **Chain root hash** | Auditors / crypto | **No** unless he asks — under “Cryptographic chain” |

**Replay** is the best 2-minute view: animated steps in order, pause on **deny**.

---

## If something breaks live

| Symptom | Fix |
|---------|-----|
| No trace | Wrong org/API key in `apps/pilot-agent/.env`; re-run agent |
| Payment not denied | `pnpm pilot:ensure-policy` then `pnpm pilot:agent` |
| fetch failed | API down — check `:8080/health`; don’t start second `pnpm dev` |
| Blank console | Use **:3000**, not Ops **:3003** |

---

## After the call

- Send [DESIGN_PARTNER_DEMO.md](./DESIGN_PARTNER_DEMO.md) email template C only if he wants a pilot — with **his** org, not `dev@salanor.local`.
- Note which workflow he named (refund, payout, KYC) for follow-up scoping.
