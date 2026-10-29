# Stoa — Product A (full specification)

**Status:** Product definition for sales, legal partners, and implementation  
**Company:** Salanor Ltd (Kigali)  
**Product name:** **Stoa** (Greek *stoa*, στοά — the portico of ordered dialogue). *Safe AI Workspace* remains a plain-language descriptor in proposals.  
**Companion product:** **Aegis** (Product B — governance when AI **acts** on APIs, payments, tools)  
**Enterprise (bank / large insurer / telco):** [`SAFE-AI-ENTERPRISE-ARCHITECTURE.md`](./SAFE-AI-ENTERPRISE-ARCHITECTURE.md) — Docker bundle, chat UX parity, gateway + customer-domain web, subscription/licensing  
**Audience:** Legal/compliance, managing partners, COO, IT lead at SMEs (10–500 staff): **law firms, insurers, fintech, consultancies, regulated agencies**

**Naming pair (customer-facing):** **Stoa** — where your people **think** with AI safely. **Aegis** — where your systems **act** with proof.

---

## 1. One sentence

**Stoa** is the **company-approved place** for staff to use ChatGPT-class AI **without pasting client secrets into random accounts** — with **automatic redaction**, **audit logs**, and **policies** your compliance officer or external counsel can stand behind.

---

## 2. The problem (what buyers feel)

| What leadership says | What actually happens |
|----------------------|------------------------|
| “Don’t use ChatGPT for client work.” | Staff use **personal** ChatGPT/Claude anyway (deadlines, drafts, translation). |
| “Our data must not go online.” | **Copy-paste** of names, IDs, case numbers, policy details, spreadsheets. |
| “We need an AI policy.” | PDF in a drawer; **no technical enforcement**. |
| “We’ll buy enterprise Copilot someday.” | Too expensive / slow; **shadow AI** fills the gap for years. |

**Cost of doing nothing:** data leakage, professional indemnity risk, regulator or client due-diligence failure, inability to prove **who** used AI on **what** matter.

**Cost of blocking everything:** lost productivity; staff hide usage; no audit trail at all.

---

## 3. What Product A is (and is not)

### It is

- A **governed AI workspace** (web application) where employees sign in with **work identity**.
- Traffic goes through **Salanor** to approved model providers (OpenAI, Anthropic, Google — per company config).
- **Data loss prevention (DLP) light:** detect and redact/mask sensitive patterns **before** the prompt leaves your control plane.
- **Session and prompt audit:** who, when, which model, redactions applied, policy decisions (allow / warn / block).
- **Admin console:** users, policies, budgets (optional), exports for internal audit or external counsel review.
- **Packaged with** AI acceptable-use policy and onboarding (often co-delivered with a **law firm partner**).

### It is not

- A replacement for **core banking systems** or payment rails.
- Full enterprise CASB or network monitoring of every website (optional add-on path only).
- “Spy on employees’ personal phones.”
- Product B (**Aegis**): blocking/approving **tool calls and APIs** when agents automate actions (see §10).

---

## 4. Who buys (ICP)

**Primary (best sell, fast cycle)**

- **Law firms & notaries** — client names, matter numbers, pleadings, contracts.
- **Insurance brokers & small insurers** — claims narratives, KYC snippets, policy wording.
- **Fintech & payment startups** — support, ops, compliance drafts (not core ledger).
- **Audit, tax, consulting boutiques** — client datasets in prompts.

**Secondary**

- Hospital admin / clinics (non-clinical staff drafts) — with stricter policy packs.
- NGOs handling beneficiary data.

**Enterprise (long cycle, high ACV — different SKU)**

- **Banks, large insurers, telcos, government** — sell **Enterprise Dedicated / Private** per [`SAFE-AI-ENTERPRISE-ARCHITECTURE.md`](./SAFE-AI-ENTERPRISE-ARCHITECTURE.md): **AI gateway + `ai.{customer}` web**, SSO, BYOK, subscription (not source-code sale). Often enter via **Head of InfoSec / innovation** (shadow AI), not core banking IT.
- Not first **cash** for a solo founder unless a paid discovery + dedicated tenant is contracted upfront.

**Poor fit (defer or education only)**

- Teams with zero AI curiosity — readiness sprint only.
- Buyer wants **perpetual source-code ownership** with no maintenance — non-standard; see enterprise doc §5.

**Law firms as customers:** partners worry about **client confidentiality** and **bar rules**. Safe AI Workspace gives them a **defensible story**: approved tool, redaction, log, policy aligned with counsel.

---

## 5. How it works (plain language)

### For an employee

1. Open **workspace.salanor.com** (or customer subdomain) — sign in with work email / SSO (later).
2. Choose a **approved model** (e.g. GPT-4.1, Claude — what the firm paid for).
3. Type or paste work content. **Before send:**
   - System scans for sensitive patterns (names, national IDs, emails, phone, card numbers, API keys, custom firm keywords).
   - High-risk paste → **block** with explanation, or **mask** (`[CLIENT_NAME]`, `[REDACTED]`) and allow send.
4. Get the answer in the same thread — **no need for a personal ChatGPT account**.
5. Optional: export thread for matter file (policy-dependent).

### For compliance / managing partner / IT

1. Dashboard: active users, sessions, **blocked attempts**, top redaction types.
2. Pull **audit export** (CSV/PDF + signed bundle on higher tiers) for a date range or matter tag.
3. Edit **policy**: block categories, require “no paste over N characters”, allowed models, retention days.
4. Connect **firm’s API keys** (or Salanor-resold keys with markup) — spend visible per team.

### For external legal counsel (e.g. partner law firm)

- Review **template acceptable-use policy** mapped to local data protection law.
- Optional **legal sign-off** on policy + retention + subprocessors (OpenAI/Anthropic DPAs).
- Firm sells **“AI governance setup”**; Salanor provides **technology + audit artifact**.

---

## 5.1 Deployment modes (how traffic is governed)

The market uses **four patterns**. Salanor supports **all over time**; **Phase 1 ships Mode A only**.

```
                    HOW TRAFFIC GETS GOVERNED
┌─────────────────────────────────────────────────────────────────┐
│ A. APPROVED WORKSPACE (portal) — Salanor Phase 1 default         │
│    User opens ai.company.rw → DLP → BYOK → OpenAI/Anthropic     │
├─────────────────────────────────────────────────────────────────┤
│ B. INLINE API / NETWORK GATEWAY — Phase 2+ (IT-led)             │
│    Apps or office network proxy → same control plane as A        │
├─────────────────────────────────────────────────────────────────┤
│ C. BROWSER EXTENSION — Phase 2+ optional (MDM-led)               │
│    User stays on chatgpt.com/claude.ai → scan on paste/submit    │
├─────────────────────────────────────────────────────────────────┤
│ D. VENDOR-NATIVE — customer already on Microsoft 365             │
│    Purview DLP on Copilot only — Salanor covers non-Microsoft AI │
└─────────────────────────────────────────────────────────────────┘

Later (Product B): AGENT / TOOL GOVERNANCE — Aegis on MCP, APIs, payments
```

| Mode | Catches personal ChatGPT on office WiFi? | Works from home? | IT effort | Salanor phase |
|------|------------------------------------------|------------------|-----------|---------------|
| **A — Portal** | No (unless staff use portal) | Yes, if they use portal | Low | **Phase 1** |
| **B — Gateway / DNS proxy** | Yes, if IT routes AI domains | Yes, with **company VPN** | High | Phase 2 |
| **C — Extension** | On **managed browser** only | Managed laptop only | Medium | Phase 2 (if demanded) |
| **D — Purview** | N/A (Copilot only) | Per M365 license | Medium (M365 admin) | Partner / integrate narrative |

**Honest limit:** No product stops **personal phone + 4G + personal ChatGPT** without invasive MDM. Strategy: (1) make **approved path** better, (2) **policy + training**, (3) optional VPN/gateway for remote staff on managed devices.

**Customer-facing URL:** Not the public marketing site. **SME:** `{org}.salanor.com`. **Enterprise (standard):** **`ai.{customer-domain}`** on **dedicated tenant** (CNAME to Salanor-operated stack). See enterprise architecture doc for gateway URL (`ai-gw.internal…`) and private deploy.

---

## 5.2 Employee privacy (not “boss reads my chat”)

If staff believe managers spy on drafts, they **bypass** the product and shadow AI wins.

| Principle | Implementation |
|-----------|----------------|
| **Role separation** | Default: **Compliance / DPO / Auditor** role sees exports — **not** line managers |
| **Logging tiers** | **Metadata-first:** user, time, model, redaction count, policy outcome; full prompt text optional per tenant |
| **Investigation** | **Break-glass:** named reason code + limited roles (like banking systems) |
| **Work vs personal** | Policy: portal is for **work**; don’t mix personal life in tenant |
| **Sales line** | *“We protect the **firm** in a dispute — not give the CEO a feed of your brainstorming.”* |

Align with market leaders: [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/observability/logging/) supports **metadata-only** logs via `cf-aig-collect-log-payload: false`; Salanor should offer the same choice.

---

## 5.3 Model cost (avoid “pay Salanor + ChatGPT + Claude + …”)

| Model | Who pays OpenAI/Anthropic | When to use |
|-------|---------------------------|-------------|
| **BYOK (default)** | Customer’s existing org contract | Banks, any firm with procurement |
| **Single model pilot** | One provider in Phase 1 | Reduce decision fatigue |
| **Salanor-resold tokens** | One invoice (usage + small margin) | SMEs with no IT |
| **Pilot bundle** | **Included model budget** in pilot fee for 90 days | No triple signup on day one |

**Salanor invoice** = seats + governance + redaction + audit. **Model bill** = separate line (theirs or pass-through). Copilot shops: Position Product A for **non-Microsoft** AI and **non-Copilot** staff workflows.

---

## 6. Architecture (technical — full product)

```
┌─────────────────────────────────────────────────────────────────┐
│  Employee browser — Salanor Safe AI Workspace (Next.js)        │
│  Chat UI · matter tags · file upload (scanned) · role-based UI   │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Salanor Control Plane (existing platform + new services)        │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ Auth / Org   │  │ Policy engine │  │ DLP / Redaction pipeline│ │
│  │ (salanor-id) │  │ (rules per    │  │ regex · NER · custom    │ │
│  │              │  │  tenant)      │  │ dictionaries · block/   │ │
│  └──────────────┘  └──────────────┘  │ mask / warn             │ │
│  ┌──────────────┐  ┌──────────────┐  └────────────────────────┘ │
│  │ Audit ledger │  │ Model router  │  OpenAI · Anthropic · …     │
│  │ signed events│  │ budgets/keys  │  (customer BYOK default)    │
│  │ (Aegis-style)│  └──────────────┘                             │
│  └──────────────┘                                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                    LLM provider APIs
```

**Data flow (one message)**

1. User submits prompt (+ optional attachments).
2. **Policy engine** evaluates: user role, model allowed, time, matter tag.
3. **DLP pipeline** transforms prompt; records what was redacted (not always raw secrets in logs).
4. **Audit event** ingested (tenant, user, hash of prompt, redaction stats, policy version).
5. **Router** calls model with firm’s key; streams response.
6. Optional **response scan** (prevent model echoing leaked patterns).
7. Store thread per retention policy; expose in admin export.

**Deployment**

- **SaaS multi-tenant** (default): Neon Postgres, Fly APIs, Vercel UI — same stack as Salanor platform.
- **Dedicated tenant / VPC** (Enterprise): single-tenant DB, customer region, custom retention, **customer domain**.
- **Private cloud / customer K8s** (Enterprise Private): Salanor **container images + Helm**, customer subscription—**not** default source-code transfer (see [`SAFE-AI-ENTERPRISE-ARCHITECTURE.md`](./SAFE-AI-ENTERPRISE-ARCHITECTURE.md) §4–5).
- **AI Gateway** (Phase 2+): OpenAI-compatible API service (**Fastify**, same control plane as web UI)—apps change `baseURL`; employees use web client to the same backend.

**Security baseline**

- TLS everywhere; encryption at rest for DB; secrets in env/KMS.
- **No training** on customer data via provider **zero-retention / enterprise** agreements where available.
- Tenant isolation; RBAC (admin, auditor, user).
- Subprocessor list in DPA (Salanor + OpenAI/Anthropic as applicable).

---

## 7. Feature phases (full roadmap — sell the vision, build in slices)

### Phase 1 — **Launch (sellable in 6–8 weeks)**

| Feature | Detail |
|---------|--------|
| Web workspace | Multi-turn chat, model picker (2 providers), org login |
| DLP v1 | Regex + rules: email, phone, RW/EAC ID patterns, PAN, API keys, custom word lists |
| Actions | **Mask** (default), **Block** on severity, **Warn** banner |
| Admin | Users, invite, policy toggles, 30-day audit view, CSV export |
| Audit | Per-message metadata + signed event hook (reuse Aegis ingest patterns) |
| Onboarding | 2-hour remote setup + policy PDF template |

**Sell as:** “Pilot — one department, up to 25 users, 90 days.”

### Phase 2 — **Professional (3–4 months after launch)**

| Feature | Detail |
|---------|--------|
| Matter / case tags | Tag sessions for law firm matter numbers; export by matter |
| File upload scan | PDF/DOCX text extraction + DLP before model |
| SSO | Google Workspace / Microsoft Entra |
| Retention policies | Auto-delete threads after N days |
| Auditor role | Read-only, export-only |
| Billing | Per-seat + pass-through model usage |
| French + English UI | |
| **Gateway mode (optional)** | IT guide: proxy OpenAI-compatible traffic through Salanor (Cloudflare-style); same DLP/audit as portal |
| **Extension (optional)** | Nightfall-style overlay on `chat.openai.com` / `claude.ai` for clients with MDM — only if contracted |

### Phase 3 — **Regulated bundle**

| Feature | Detail |
|---------|--------|
| NER / ML detector | Better name/entity detection (local or API) |
| SIEM webhook | Splunk/Datadog JSON stream |
| Legal hold | Freeze threads for litigation |
| Compliance packs | Pre-built policy packs: **law firm**, **insurance**, **fintech** |
| Counsel review workflow | External lawyer approves policy version in-app |
| EU AI Act / DORA mapping doc | Evidence mapping (not certification claim) |

### Phase 4 — **Bridge to Product B (Aegis)**

| Feature | Detail |
|---------|--------|
| “Automate this workflow” | From chat → approved n8n/Make template with **Aegis witness** on tool steps |
| Agent sandbox | Same tenant turns on **agent** with tool policies |
| Unified audit | Prompt logs + **action traces** in one compliance export |

---

## 8. Packaging & pricing (sellable)

**Tenancy:** **One customer org = one Stoa tenant = one deployment** (BK staff globally → same SSO, URL, policies). Subsidiaries / separate legal entities → separate tenants. Detail: enterprise doc **§6.1**.

**Pricing logic:** **Two numbers + setup** — **(1) annual platform subscription**, **(2) committed licensed users**; **BYOK** for models at enterprise scale (no token markup). Gateway volume **included** to a fair-use cap; overage only for heavy API automation. Detail: enterprise doc **§6.2**.

| Plan | Who | Includes | Indicative price (USD) |
|------|-----|----------|-------------------------|
| **Readiness only** | Anyone | Workshop + AI acceptable-use policy (legal partner optional) | $1.5k–3k fixed |
| **Pilot** | 1 team, ≤25 users | Phase 1 Stoa + setup + 90 days support | $2k setup + $8–12/user/mo |
| **Professional** | Firm-wide | Phase 2 features, SSO, matter tags | $15–25/user/mo (min 10 seats) |
| **Regulated** | Insurer / large firm | Phase 3 + dedicated support + custom DPA | Quote |
| **Enterprise Dedicated** | Regional bank, large insurer | Dedicated tenant, SAML, **`ai.customer.com`**, gateway | Setup + **annual platform** + **licensed user band** |
| **Enterprise Private** | Sovereignty / VPC (BK-class) | Customer Azure, Stoa images + support | Setup $25–50k + **$72–150k+/yr platform** + user band (often **all-in annual** quote) |
| **Model usage (SME)** | &lt;500 staff | Salanor-billed at cost + 10–15% optional | Pass-through |
| **Model usage (enterprise)** | Bank, insurer | **BYOK only** — not on Stoa invoice | — |

**Licensing (all paid tiers):** **Subscription** to use the platform (Salanor-hosted or private deploy). Customers do **not** receive Salanor source code by default—**containers, config, audit data, and admin control** yes. Details: enterprise doc §5.

**Law firm channel:** counsel sells **Readiness + Legal review** ($3k–8k); Salanor sells **Pilot/Pro** tech; revenue share optional (10–20% referral).

**Rwanda / RWF:** quote in RWF equivalent for local SMEs; anchor to “less than one malpractice scare.”

---

## 9. Sales speech (60 seconds — live or WhatsApp voice note)

> “Your people already use ChatGPT on their phones — you just don’t see it.  
> **Safe AI Workspace** is the version you’re allowed to use: same kind of help, but through **your firm’s account**, with **client names and IDs stripped before they hit the model**, and a **log** if compliance or a client ever asks who used AI on what.  
> We’re not telling you to rush into robots moving money. We’re fixing the leak you have **today** — copy-paste into public AI.  
> Setup is days, not a year-long IT project. We usually start with **one practice group or department**, pair it with a short **AI use policy** your lawyers can sign off on, and expand when you’re comfortable.  
> When you later automate workflows that touch payments or client systems, the same platform grows into **Aegis** — human approval and proof on those actions. One partner, two stages.”

---

## 10. Relationship to Aegis (Product B)

| | **Product A — Safe AI Workspace** | **Product B — Aegis** |
|---|-----------------------------------|------------------------|
| **Risk** | Data **leaving** in **prompts** | Software **acting** (APIs, tools, payments) |
| **User moment** | “I’m drafting / analyzing” | “The bot tried to pay / update / export” |
| **Control** | Redact, block, log prompts | Deny, require approval, signed trace |
| **Typical buyer** | Managing partner, COO, DPO | CTO, CISO, Head of Compliance |
| **Timing** | **Buy first** (shadow AI) | **Buy when** automation goes live |

**Single company narrative:** Salanor helps regulated teams **adopt AI safely** — first **how they chat**, then **how systems act**.

---

## 11. Competitive landscape (how similar products work)

### 11.1 Architecture families (market map)

Almost every vendor fits **one primary family**. Salanor Product A competes in **A + B**; Aegis competes in **agent/tool** (same lane as Barndoor).

| Family | What it does | Representative products |
|--------|----------------|-------------------------|
| **Inline API / AI gateway** | Change `base_url` or network path; DLP + log before provider | [Roder](https://roder.ai/), [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/), [PromptGate](https://promptgate.com/), [BastionGate](https://www.bastiongate.ai/) |
| **Browser / endpoint DLP** | User keeps chatgpt.com; extension scans paste/submit | [Nightfall AI](https://www.nightfall.ai/solutions/firewall-for-ai-copilots) |
| **Microsoft-native** | DLP only on M365 Copilot prompts/grounding | [Microsoft Purview DLP for Copilot](https://learn.microsoft.com/en-us/purview/dlp-microsoft365-copilot-location-learn-about) |
| **Agent / MCP governance** | Policy + approval on **tool calls**, not chat paste | [Barndoor](https://barndoor.ai/), Salanor **Aegis** |

---

### 11.2 Reference products (deep dive)

#### Roder — EU “control plane” (gateway + DLP + audit)

- **Flow:** Clients point OpenAI-compatible traffic at `https://gateway.roder.ai/v1` instead of the provider ([AI Gateway](https://roder.ai/platform/ai-gateway)).
- **Inline:** Identity → policy → DLP (redact/block PII, secrets) → route to 2,000+ models; ~41ms claimed on hot path.
- **Keys:** Provider keys in vault; teams use Roder keys ([platform](https://roder.ai/platform)).
- **Audit:** Long-retention, SIEM-oriented, EU residency narrative ([pricing from ~€199/mo](https://roder.ai/pricing)).
- **Shadow ChatGPT:** Only if traffic **uses the gateway** — consumer chatgpt.com bypasses unless network forces proxy.
- **Lesson for Salanor:** Mature **portal + gateway + BYOK + audit** in one brand; **enterprise / dev-first** entry.

#### Nightfall — shadow AI on real websites

- **Flow:** Chrome extension (Google Admin / MDM) on AI domains (`chat.openai.com`, `claude.ai`, etc.) ([ChatGPT DLP](https://www.nightfall.ai/lp/chatgpt-dlp)).
- **On submit:** Detect 100+ sensitive types; **block**, **redact**, or **coach** with in-app notifications ([policies](https://help.nightfall.ai/data-exfiltration-prevention/exfiltration_endpoint/policies/recommended-policy-configurations)).
- **Optional:** Override with business justification; desktop agents for thick apps (version-specific limits in [FAQs](https://help.nightfall.ai/data-exfiltration-prevention/exfiltration_endpoint/policies/frequently-asked-questions-faqs)).
- **Lesson for Salanor:** Best match for **“use ChatGPT but safely”** without own UI; **heavy** to build (extension + detectors + MDM). Phase 2 **optional**, not MVP.

#### Cloudflare AI Gateway — infra proxy + logging + DLP

- **Flow:** Forward proxy `gateway.ai.cloudflare.com/v1/.../{provider}` ([architecture](https://developers.cloudflare.com/reference-architecture/diagrams/ai/ai-multivendor-observability-control/)).
- **Logging:** Tokens, cost, latency; optional full payload or **metadata-only** via headers ([logging](https://developers.cloudflare.com/ai-gateway/observability/logging/)).
- **DLP:** FLAG/BLOCK on match when enabled.
- **Network vision:** Route **all** office OpenAI traffic through Cloudflare ([blog](https://blog.cloudflare.com/announcing-ai-gateway/)) — Salanor **Phase 2 gateway** analogue.
- **Lesson for Salanor:** **BYOK** + configurable payload logging = privacy story.

#### Barndoor — MCP / agent tools (adjacent to Aegis, not Product A)

- **Flow:** MCP JSON-RPC through Barndoor proxy; JWT auth; OAuth injected to third parties ([MCP proxy](https://docs.barndoor.ai/api-reference/mcp/proxyMcpRequest)).
- **Policy v2:** Per tool allow, deny, or `tools/call:X:approve` ([manage policies](https://docs.barndoor.ai/how-tos/manage-policies)); approvals on **tool router** path (not all MCP paths).
- **Lesson for Salanor:** Validates **Product B**; don’t fight Barndoor on **chat DLP** — upsell **Aegis** when agents act.

#### Microsoft Purview — incumbent for Copilot shops

- **Flow:** DLP on Copilot prompts with sensitive information types → block response / restrict web grounding ([Learn](https://learn.microsoft.com/en-us/purview/dlp-microsoft365-copilot-location-learn-about)).
- **Scope:** **M365 Copilot**, not Claude.ai in a personal tab.
- **Lesson for Salanor:** Reply: *“We cover **non-Microsoft AI** and **automation actions** Purview doesn’t see.”*

---

### 11.3 Comparison (buyer concerns)

| Product | User UX | Personal ChatGPT? | Home / phone | Model cost | Manager sees all prompts? |
|---------|---------|-------------------|--------------|------------|---------------------------|
| **Roder** | API URL change | Only via gateway | Gateway/VPN | BYOK / vault | Enterprise audit norms |
| **Nightfall** | Same AI websites + extension | **Yes** (managed browser) | Weak | Site + Nightfall | DLP alerts, not default browse-all |
| **Cloudflare** | App proxy; network optional | If DNS/proxy enforced | VPN | BYOK typical | Configurable logging |
| **Purview** | Copilot in M365 | No | Per license | M365 bundle | Admin DLP |
| **Salanor Phase 1** | **Company portal** | No (unless portal used) | Portal from anywhere | **BYOK default** | **Compliance role; metadata-first** |

---

### 11.4 What the market agrees on (design requirements)

1. Control at **submit** or **API** boundary — not honor system alone.  
2. **Detect → redact / block / coach** on sensitive data.  
3. **Identity** on every event (user / agent).  
4. **Split logging:** metadata default; full prompt optional.  
5. **Agents** are the next spend line — tool/MCP policy converges with Aegis.

---

### 11.5 Salanor positioning vs “best in class”

| Global players | Salanor Safe AI (Product A) |
|----------------|----------------------------|
| Enterprise IT, SIEM-first | **Managing partner / compliance-first** language |
| US/EU list price | **Africa / SME pricing**, local payment, Kigali support |
| Software only | **Readiness + policy + legal partner** bundle |
| Developer or extension first | **Employee portal first** → gateway/extension when IT ready |
| Agent product separate | **Aegis upgrade**, same vendor |

**Recommended build order**

1. **Phase 1:** Mode **A** (portal, BYOK, DLP, privacy-aware audit).  
2. **Phase 2:** Mode **B** (gateway doc + proxy) and/or **C** (extension) per paying client.  
3. **Phase 4:** **Aegis** (Mode agent/tool) — Barndoor lane.

```text
Employee
   │
   ├─► chatgpt.com ──► (Phase 2: extension or network proxy)
   │
   └─► ai.{firm}.rw (Safe AI Workspace) ──► DLP ──► BYOK ──► providers
              │
              └─► audit (metadata-first, compliance role)

Later: Agent/workflow ──► Aegis ──► tools / APIs / payments
```

---

## 11.6 Differentiation summary (one table)

| Them | Salanor |
|------|---------|
| Barndoor, Roder (agent/MCP heavy) | **Chat-first** for shadow AI, then same platform → Aegis |
| Nightfall (US enterprise DLP) | **Portal + policy + local counsel**; optional extension later |
| Cloudflare (needs CF estate) | **Standalone SaaS** for firms without Cloudflare |
| Purview (Copilot only) | **Claude/ChatGPT-class** + future agent governance |

---

## 12. Implementation checklist (customer onboarding)

1. Sign DPA + acceptable-use policy (customer + counsel).
2. Create org tenant; invite admin.
3. Configure models (BYOK keys in vault).
4. Upload custom redaction dictionary (client names, matter prefixes).
5. Pilot users trained (30 min): “Use this URL, not personal ChatGPT.”
6. Week 2 review: blocked events, adjust policy.
7. Month 3: expand seats or add matter tags / SSO.

---

## 13. Success metrics

- **Adoption:** ≥60% of pilot users active weekly (shadow AI redirected).
- **Risk:** ≥90% of high-severity patterns masked or blocked (test with synthetic prompts).
- **Compliance:** audit export delivered within 24h of mock “client inquiry.”
- **Commercial:** renewal + referral to counsel network.

---

## 14. Risks & honest limits

- Deterministic redaction **misses** creative leaks — combine policy, training, and block on huge pastes.
- Staff can still use personal AI — goal is **make approved path easier**, not spy.
- Provider outages — status page, fallback model.
- Legal: Salanor does **not** provide legal advice; **counsel** owns policy text; Salanor provides **tool + logs**.

---

## 15. Internal next steps (Salanor)

1. Message legal partners (e.g. Dennis) with **trust / pilot / policy** angle (see sales speech §9).
2. Ship Phase 1 against existing auth/org/ingest stack.
3. One **design partner** law firm or insurer pilot (paid).
4. Loom demo: paste fake client letter → redaction → answer → export log.
5. Marketing page section: **Safe AI Workspace** + **Aegis** (two products, one story).

---

*Document owner: Salanor product. Last expanded: enterprise cross-link + SKUs (see [`SAFE-AI-ENTERPRISE-ARCHITECTURE.md`](./SAFE-AI-ENTERPRISE-ARCHITECTURE.md)).*
