# Salanor Aegis — Partner leave-behind (after first call)

**Audience:** Design partner / pilot customer (security, engineering, compliance)  
**Use:** Email or PDF attachment after discovery. Adjust URLs for staging vs production.

---

## What Salanor gives you

Salanor is **governance and provenance for production AI agents**: every material step (LLM call, tool call, policy decision, human approval) is recorded as a **signed, hash-linked event** in one **trace timeline**. You see what ran, what data was touched, what policy allowed or denied — and you can **verify** records independently of our UI.

This is **not** a generic log aggregator. Agent runtime lives in **Traces** and **Search**; human/admin actions (login, invites, API keys, exports) live in **Logs**.

---

## 1. Trace timeline — one session, one story

| Concept | Meaning |
|--------|---------|
| **Trace** | One agent session (e.g. “handle ticket #4821”). |
| **Span** | A logical step (LLM triage, payment tool, safe reply). |
| **Event** | One atomic action: input, output, policy, or governance — numbered in order. |

**What to look for in a pilot demo**

- **ALLOW** on reads and LLM steps (what the agent was permitted to do).
- **DENY** on a sensitive tool (e.g. payment) — proof the agent did **not** execute the forbidden action, even if the model “wanted” to.
- **Provenance claim** span — what authority and data classification the run asserts up front.

*Talking point:* “If legal asks ‘did the AI charge the card?’, you open one trace — not chat exports.”

---

## 2. SIEM forwarding (OpenTelemetry)

Configure **Settings → Integrations** with your OTLP logs endpoint (Splunk, Datadog, Microsoft Sentinel, or any collector that accepts OTLP/HTTP JSON at `/v1/logs`).

After ingest, Salanor can **forward each governed event** to your SIEM so your SOC correlates agent actions with the rest of your telemetry — same retention, alerting, and access controls you already use.

*Talking point:* “We meet security where they already work — we don’t ask you to abandon your SIEM.”

---

## 3. Verify chain + inclusion

On any event, **Verify chain + inclusion** re-runs cryptographic checks:

| Check | What it proves |
|-------|----------------|
| **Chain** | Event was **signed** with the agent’s Ed25519 key; payload **hash** matches; link to the **previous** event in sequence (tamper-evident per agent). |
| **Inclusion** | Event hash is **included** in a published **Merkle witness batch** (anchoring beyond “trust our database”). |

**Valid** → signature, hash, chain link, and inclusion proof all pass.  
**Invalid** → tampering, bad signature, or witness batch not yet published (common in fresh dev environments until witness jobs run).

**Public verify** (no console login): shareable URL with org slug + event ID for auditors or outside counsel.

*Talking point:* “Changing a row in our database breaks verification — you don’t have to take our word for it.”

---

## 4. Signed payload vs enriched view

On the event detail page you will see two JSON panels:

| Panel | Role |
|-------|------|
| **Payload (signed)** | The exact payload that was part of the **APS-1** event when the agent signed and ingested it. This is what integrity checks use. |
| **Enriched provenance** | Console-only normalization (provider, action, authority hints) for operators and policy — **not** a second signature. |

*Talking point:* “The signed payload is the record; the enriched view is how we make it readable.”

---

## 5. Immutability — how to explain it (client, investor, counsel)

**One sentence:**  
Each agent action is an **append-only, Ed25519-signed** record, **hash-linked** to the prior action and **batched into a Merkle witness**, so undetected alteration of history is impractical.

**Three layers**

1. **Technical (CISO / engineering)** — Open **APS-1** event format; per-agent hash chain; agent signing keys; witness + inclusion proofs; compliance export ZIPs (SOC 2 / EU AI Act oriented bundles).
2. **Business (executive)** — Ordered timeline of allow/deny/attempt; policy outcome on sensitive tools; dispute-ready narrative without relying on chat logs alone.
3. **Legal / risk** — Strong **audit evidence** and **integrity** guarantees for instrumented paths; counsel should review admissibility and scope. We do **not** claim “all AI activity everywhere” — only what your integration records via the SDK.

**Honest scope:** Immutability applies to **properly signed, witnessed events**. Your agents must call Salanor on the governed path (SDK or approved proxy).

---

## 6. Standards we use (not invent)

| Name | What it is |
|------|------------|
| **Ed25519** | Industry-standard public-key signature algorithm (RFC 8032). Used by SSH, modern TLS, and many security products. Salanor **uses** it; we did not create it. |
| **APS-1** | Salanor’s **open Agent Provenance Standard** (draft): JSON event envelope, canonicalization (JCS), Ed25519 signing. Target: publish under Apache-2.0 for third-party verifiers. Draft **0.2** will add JSON Schema, DID binding, inclusion-proof attachment format. |

---

## 7. Integration readiness (pilot)

| SDK | Status | Notes |
|-----|--------|--------|
| **TypeScript / Node.js** (`@salanor/aegis`) | **Pilot-ready** | Node 18+, ESM. Sign, ingest, spans, `wrapFetch` policy proxy, approvals. Used by `pilot-agent` and conformance tests. |
| **Python** (`salanor-aegis`) | **Pilot-ready** | Sign + ingest, spans, `record_*`, `enforce_tool_policy`; conformance tests. No HTTP `wrapFetch` — use TS at edge or `enforce_tool_policy` before tools. |
| **Go** | **Pilot** | Sign, ingest, public verify. |

**Deployment today:** Partners typically integrate from the **monorepo / workspace** build or a staged artifact you provide; **public npm/PyPI publish** is on the GA path — ask Salanor for the current install method for your environment.

---

## 8. Suggested pilot path (2–3 weeks)

1. **Salanor** provisions your org + first admin (Platform Ops).  
2. **Your admin** invites engineers, creates **ingest API key**, reviews policy.  
3. **Your engineer** instruments one agent (SDK) or runs the reference `pilot-agent` against your staging API.  
4. **Joint review** — trace timeline, one **DENY**, one **Verify** (after witness batch), optional SIEM destination, optional compliance export.

**Contacts:** [your name] · [email] · Staging console: [URL]

---

*Internal reference: [PILOT_WALKTHROUGH.md](../../docs/PILOT_WALKTHROUGH.md), [E2E_PARTNER_ONBOARDING.md](../../docs/E2E_PARTNER_ONBOARDING.md), [APS-1 draft](../aps/APS-1-draft-0.1.md).*
