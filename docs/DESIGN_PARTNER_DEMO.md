# Design partner demo — sales runbook

**Use this doc** to book calls, run a **20-minute live demo**, and hand off a pilot.  
**Technical depth:** [PILOT_WALKTHROUGH.md](./PILOT_WALKTHROUGH.md) · [FIRST_DESIGN_PARTNER.md](./FIRST_DESIGN_PARTNER.md) · [INVESTOR_DEMO.md](./INVESTOR_DEMO.md)

---

## What you are selling (say this, not “approvals”)

**One line:** Verifiable audit trail and policy gates for AI agents and automations — what the model saw, what tools ran, what was blocked, evidence you can export.

**Lead with:** signed traces → policy deny (or allow) → **compliance export**.  
**Approvals** are optional scene 3 — only if they mention irreversible actions (payments, Rx, prod deletes).

---

## Who to call this week (ICP filter)

Say **yes** only if at least one is true:

| Signal | Why they might pay |
|--------|-------------------|
| Agent or LLM workflow **in production** (or going live in 30 days) | They will need proof when something breaks |
| Security / compliance questionnaire about **AI** | They need answers, not slides |
| **Money, PII, or regulated** data in agent paths | Deny + audit is concrete |
| Already built **custom logging** and hate maintaining it | You replace archaeology |

Say **no** (politely defer) if: no agents yet, “we’ll need this someday,” or they want generic workflow software with no audit story.

**Outreach size:** 15–25 names → goal **3–5 live demos**, not mass email.

---

## Pre-demo checklist

### 48 hours before

- [ ] Pick environment: **staging/prod** preferred for real calls; local only if prospect is technical and OK with `localhost`.
- [ ] Run dry demo once: `pnpm dev` → `pnpm pilot:ensure-policy` → `pnpm pilot:agent` → open trace URL.
- [ ] Confirm: **deny** on `stripe.paymentIntents.create` visible in trace timeline.
- [ ] Skim [INVESTOR_DEMO.md](./INVESTOR_DEMO.md) — “ledger vs emergency brake” talk track.

### 1 hour before

- [ ] Provision **their** org in Platform Ops (`:3003` or prod Ops) **or** use a named sandbox org you prepared.
- [ ] Copy signing key + org/agent/key IDs into `apps/pilot-agent/.env` (do not share Ops or bootstrap secret).
- [ ] Browser: customer console logged out; incognito ready for “partner admin” view if needed.
- [ ] Close unrelated tabs; mute notifications.

### 5 minutes before

- [ ] `pnpm pilot:agent` once — fresh trace URL in clipboard.
- [ ] Console → **Traces** list loaded.
- [ ] Optional: **Exports** page open in second tab for minute 15.

---

## 20-minute demo agenda

| Min | You show | You say |
|-----|----------|---------|
| 0–2 | Dashboard / context | “This is your org’s control plane for automated decisions — not another chat UI.” |
| 2–8 | Open **trace** from pilot agent | Start at the **plain summary** at the top (blocked actions, data touched). Title should read like a sentence, not a UUID. |
| 8–12 | **Step-through replay** — pause on deny | “The agent tried a payment; **policy stopped it before Stripe**. Same mechanism for your tools.” |
| 12–15 | **Search** (one keyword) or **Why this matters** panel | “When nothing is denied, you still have the audit map — SOC 2, customer dispute, regulator ask.” |
| 15–18 | **Compliance export** (start or show completed) | “This is the bundle you hand audit — not screenshots of ChatGPT.” |
| 18–20 | Next step | “Two design partner slots — we wire one real workflow in 8 weeks. Interested?” |

**If they ask about humans in the loop:** “We support approval queues for high-risk actions; the product value is the **signed record** either way.”

**Do not show:** Platform Ops, migrations, newsletter CMS, dev seed accounts, `dev@salanor.local`, repo structure unless they are engineering deep-dive.

---

## Design partner offer (keep it simple)

| Term | Suggestion |
|------|------------|
| Duration | 8–12 weeks |
| Their commitment | One **real** workflow (support refund, internal ops, etc.), weekly 30 min, one engineer for SDK wiring |
| Your commitment | Provision org, policy template, onboarding calls, help with `pilot-agent` or SDK |
| Commercial | Fixed **pilot fee** (even modest) or signed LOU — avoids tire-kickers |
| Success | Production ingest on their workflow + shared case study if they agree |

---

## Email templates

### A — Cold / warm outreach (short)

**Subject:** 20 min — audit trail for your AI agents?

Hi [Name],

Teams shipping agents into [payments / support / ops] usually get the same question from security or finance: *what did the model see, and what did it try to execute?*

We built **Aegis** — signed event traces, policy gates before tools run, and exportable evidence. I’m not pitching a generic approval tool; it’s a **verifiable decision record** for high-risk automation.

Open to a **20-minute live demo** this week? I’ll run a real blocked-payment scenario in your sandbox org.

[Your name]  
Salanor

---

### B — After they say yes (calendar confirm)

**Subject:** Salanor demo — [date/time]

Hi [Name],

Confirmed for [date/time] ([timezone]).

I’ll show: agent trace → policy block on a payment tool → export for audit. No prep on your side; optional: one sentence on the workflow you care about most (refunds, data access, etc.).

Join: [Zoom/Meet link]

Thanks,  
[Your name]

---

### C — Post-demo handoff (provisioned partner)

**Subject:** Your Salanor console access — [Company]

Hi [Name],

Thanks for the call. Here is your **customer console** (bookmark this):

| | |
|--|--|
| **Login** | https://app.salanor.com/login *(or your staging URL)* |
| **Email** | [admin email you provisioned] |
| **Temp password** | [secure channel — not email if policy forbids] |

**Please do this week:**

1. Sign in → **Settings → Security** → change password.  
2. **Members** → invite your engineer.  
3. **API keys** → create an ingest key (copy secret once).  

We’ll schedule a working session to point our reference agent (or your code) at your org. Technical steps: [PILOT_WALKTHROUGH.md](./PILOT_WALKTHROUGH.md) Part 3 (share only the partner-facing sections).

Do **not** share Platform Ops or internal admin URLs.

Best,  
[Your name]

---

## After the call (your internal checklist)

- [ ] Log outcome in CRM / sheet: ICP fit, workflow named, next date, pilot fee discussed.
- [ ] Ops: org slug, plan, audit log checked ([FIRST_DESIGN_PARTNER.md](./FIRST_DESIGN_PARTNER.md) §5).
- [ ] Send handoff email C within 24 hours if moving forward.
- [ ] If “not now”: one-line nurture — “When agent hits prod, ping us for the trace demo.”

---

## Troubleshooting on a live call

| Symptom | Fast fix |
|---------|----------|
| No trace after agent | Wrong org on API key; re-run `pnpm pilot:ensure-policy` + `pnpm pilot:agent` |
| Payment not denied | Activate policy denying `stripe.paymentIntents.create` |
| Agent fetch failed | API health `…/health`; don’t restart duplicate `pnpm dev` |
| Blank console | Wrong URL — customer uses **:3000 / app**, not Ops **:3003** |

Full table: [PILOT_WALKTHROUGH.md](./PILOT_WALKTHROUGH.md) Part 6.

---

## Related documents

| Doc | When |
|-----|------|
| [INVESTOR_DEMO.md](./INVESTOR_DEMO.md) | CFO / compliance angle; 60s talk track |
| [PILOT_WALKTHROUGH.md](./PILOT_WALKTHROUGH.md) | Full technical dry run + UI checklist |
| [FIRST_DESIGN_PARTNER.md](./FIRST_DESIGN_PARTNER.md) | Local provision + API fallback |
| [E2E_PARTNER_ONBOARDING.md](./E2E_PARTNER_ONBOARDING.md) | Detailed UI paths |
| [PILOT_RELEASE_CHECKLIST.md](./PILOT_RELEASE_CHECKLIST.md) | Before calling prod “ready” |
