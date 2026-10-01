# Pitch — fintech hub / design partner (≈60 seconds)

**Audience:** CTO, head of risk, or compliance lead at a company that already runs AI or automation on money, accounts, or sensitive customer data (payments, lending, insurance ops — not “we want to train models”).

---

## Opening (problem they feel)

“You’re under pressure to ship agents and automation faster. Your board and regulators still ask one question: **who authorized this action, under what policy, and can you prove it later?**  
Most teams answer with logs and screenshots. That breaks the moment you have denials, human approvals, or a dispute six months later.”

## What Salanor is (one sentence)

**Salanor is a verifiable decision record for automated actions** — every tool call is signed, chained to policy, and exportable as evidence your auditors and partners can check without trusting our UI.

## How it works (concrete, not buzzwords)

1. Your agent runs through our **witness**: policy runs *before* the dangerous call (deny, allow, or require human approval).
2. Each step becomes a **cryptographic event** in a trace — who acted, what was decided, what ran.
3. Your team uses the **console** for traces, approvals, and policy — not a black box.
4. When compliance asks, you ship a **bundle or export**, not a spreadsheet of guesses.

## Why now / why us

“We’re not selling another chatbot. We’re the **control plane + proof layer** for automation you already plan to run in production.  
We’re looking for **one design partner** in [Kigali / your market]: a 4–6 week pilot on a **single high-risk workflow** — e.g. payment initiation, payout, or KYC escalation — with your engineers in the loop.”

## Ask

“If that matches a pain you have this quarter, let’s book **30 minutes** to pick one workflow and define success: policy enforced, trace complete, one export your risk team would accept.  
If not, who owns agent or payment automation on your side?”

---

## Do not lead with

- Platform Ops, CMS, newsletter, internal migrations
- “AI training data” or generic “responsible AI” unless they brought it up
- Fake dev accounts or demo-only magic — use their language: **production path**, real login, real org

## Do lead with

- **Deny / approval / allow** on a real tool name they recognize (`stripe.*`, internal payout API, etc.)
- **Trace + verify** — “here’s the chain root; here’s the policy version that was active”
- **Design partner** — limited slot, engineering time, shared success criteria

Full demo flow: `docs/DESIGN_PARTNER_DEMO.md`.
