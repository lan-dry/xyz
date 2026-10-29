# Stoa — Enterprise architecture & commercial model

**Status:** Canonical reference for large regulated buyers (bank, insurer, telco, government)  
**Company:** Salanor Ltd  
**Product name:** **Stoa** (Greek *stoa* — the portico where serious, ordered dialogue happens). Governed chat workspace + AI gateway on one control plane.  
**Companion product:** **Aegis** — governance when AI **acts** (tools, APIs, payments) on the same platform story.  
**Spec:** [`SAFE-AI-WORKSPACE-PRODUCT.md`](./SAFE-AI-WORKSPACE-PRODUCT.md) (features, ICP, pricing; *Safe AI Workspace* = descriptive name for the same product)

---

## 1. One sentence (owner / CISO)

You buy **governed access to LLMs**: a **bank-branded web app** for staff and a **mandatory API gateway** for every app and agent—**one policy, one DLP pipeline, one audit story**—hosted as **Salanor-operated dedicated SaaS** or **deployed in your cloud**, on **subscription + support**, not a one-time source-code handoff unless you explicitly purchase a **private license**.

---

## 2. What you sell (two interfaces, one platform)

| Interface | User | What it is |
|-----------|------|------------|
| **Governed Chat (web UI)** | Thousands of employees | Next.js app: threads, model picker, uploads—**no API keys in the browser** |
| **AI Gateway (API)** | IT, developers, RPA, internal platforms | **OpenAI-compatible HTTP API** (`/v1/chat/completions`, streaming): every call hits policy → DLP → audit → provider |
| **Admin console** | Security, compliance, IT | Policies, dictionaries, roles, exports, retention |
| **Optional: browser extension / DNS** | Managed fleet hygiene | Same control plane; not the foundation |

**Long-term rule for tier-1/regional scale:** **Gateway is the system of record.** The web UI is a **first-party client** of that gateway—not a separate product with separate rules.

---

## 3. Reference architecture (repeatable across big customers)

```text
                    CUSTOMER — Enterprise AI Access

  [Entra ID / Okta / SAML] ──► JWT / session on every human + service request

  ┌──────────────────────────────────────────────────────────────────┐
  │  SALANOR CONTROL PLANE (dedicated tenant OR customer VPC/K8s)     │
  │  • Policy engine (models, roles, data classes, block/mask/warn)   │
  │  • DLP pipeline (regex, dictionaries, NER later)                  │
  │  • Audit ledger (metadata default; content break-glass optional)  │
  │  • Key vault (BYOK — customer OpenAI/Azure/Anthropic keys)        │
  │  • Model router (streaming, budgets, failover)                    │
  └────────────────────────────┬─────────────────────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
  https://ai.customer.com   https://ai-gw.internal…   (optional)
  Governed Chat UI          OpenAI-compatible API       Extension / proxy
  (hosted or customer)      for all applications        to same API
         │                     │
         └─────────────────────┘
                               ▼
              Azure OpenAI / OpenAI Enterprise / Anthropic (customer MSAs)
```

**Later:** tool-using agents call the **same gateway** with **Aegis** policies (approve/deny/sign)—one vendor narrative.

**Domain:** Staff-facing URL is **`ai.{customer}`** (or internal name they choose)—**not** `workspace.salanor.com` as the primary experience for enterprise.

### 3.1 Who hosts the UI and the gateway? (decision guide)

**Rule:** Treat **chat UI + gateway + policy DB** as **one control plane**. Do **not** split (“UI on Salanor, gateway in bank”)—history, sessions, and prompts would still cross two trust boundaries and procurement will reject it.

| Tier | Who hosts control plane | Best for | Your pitch |
|------|-------------------------|----------|------------|
| **Business SaaS** | **Salanor** (multi-tenant) | Law firms, SMEs | Fastest; `{org}.salanor.com` |
| **Enterprise Dedicated** | **Salanor** (single-tenant DB + compute, EU/agreed region) | Mid-size insurer, regional corp | Isolated tenant + **`ai.customer.com`** CNAME; faster than private K8s |
| **Enterprise Private (recommended for bank)** | **Customer cloud** (e.g. **Azure subscription the bank owns**) | Bank, telco, sovereignty | “Data and logs **at rest** in **your** estate; we run **supported software** there” |
| **Enterprise Private (self-operated)** | **Customer IT** runs Helm/K8s | Mature IT, strict vendor rules | Same as above; bank ops; Salanor **license + updates** |

**Recommended default to *present* to a bank (BK-class):**

1. **Lead with Private in their Azure** (or on-prem later): one deployment bundle—**UI, gateway, Postgres, Redis**—all in **their** boundary. Staff still use **`ai.bank.com`** (their DNS → their ingress).
2. Offer **Dedicated SaaS** only as **time-boxed acceleration** (e.g. 90-day shadow-AI program) with **metadata-only logs**, **BYOK to their Azure OpenAI**, and a **contractual path** to migrate to private—never as the permanent architecture for core bank.

**Who hosts what (bank private):**

| Component | Host | Notes |
|-----------|------|--------|
| Chat UI (Next.js) | **Bank Azure** (Container Apps / AKS ingress) | Branded URL |
| Gateway + admin API | **Same cluster / same VNet** | OpenAI-compatible + thread APIs |
| Postgres (threads, audit metadata) | **Bank** (Azure Database for PostgreSQL) | Retention = their policy |
| LLM inference | **Bank’s Azure OpenAI** (ideal) or OpenAI Enterprise | Prompt **after DLP** leaves control plane to **provider they already approved** |
| Salanor | **Operator**: deploy, patch, support—or **advisory** if bank runs Helm | **No requirement to give source** |

### 3.2 Chat experience (what employees see)

Same mental model as **ChatGPT / Claude**: familiar on purpose (reduces shadow AI).

| Behavior | Design |
|----------|--------|
| **Account** | Work identity (**SSO**); no personal OpenAI login |
| **Threads** | **Many chats per user**; sidebar list, rename, archive, delete per retention |
| **History** | Stored in **tenant DB** (location = hosting tier above); encrypted at rest |
| **Models** | **One workspace**, not three apps: user picks **GPT / Claude / …** per **thread** (or per message on advanced tier) |
| **Routing** | **Single gateway** maps model id → provider API + **their** key; same DLP/audit for all |
| **Optional** | Org policy: “Legal team: Claude only”; “No US-only models”—still **one UI** |

Providers do **not** each get a separate “chat space” in v1—that fragments audit and training. **One governed workspace, many models** is the enterprise norm (Microsoft Copilot, internal portals, Roder-style gateways).

### 3.3 “We don’t want data at OpenAI”—why accept Salanor?

This is the core objection. Answer with **architecture + comparison**, not “trust us.”

**What they fear today (shadow AI):** Staff paste into **consumer ChatGPT** → data to **OpenAI consumer** with **no** DLP, **no** bank audit, **no** contract.

**What you propose:**

```text
  Employee  →  [CONTROL PLANE — location THEY choose]  →  DLP  →  [PROVIDER they already legal-approved]
                     ↑                                           ↑
              Bank Azure (private)                      Azure OpenAI in same tenant (best story)
              OR Salanor dedicated EU (accelerator)     BYOK, zero retention, their MSA
```

| Question | Answer |
|----------|--------|
| Does data “come to Salanor” in private deploy? | **At rest:** no—DB and apps in **bank subscription**. **In flight:** prompts hit **gateway process** in that subscription; Salanor staff access only under **contract** (ops/break-glass) or **none** if bank self-operates. |
| Is that different from OpenAI? | **Yes:** DLP **before** provider; **metadata audit**; **no** training on their tenant; models only **they** enabled. |
| Dedicated SaaS? | Honest: payload transits **Salanor-operated** isolated tenant (EU). Sell as **short phase** + same controls (BYOK, metadata logs, DPA)—**better than shadow ChatGPT**. |
| Why not block all external AI? | They already failed that; you give **controlled** path. |

**Subscription when they host (no source code):**

Standard enterprise software—not unique to Salanor.

- **License key** or **signed entitlement** checked by gateway at startup / periodic heartbeat (no key → read-only or no start—product decision).
- **Updates** via **private container registry**; renewed credentials tied to **active support contract**.
- **Contract**: no reverse engineering, no redistribution, audit right for compliance—not source delivery.
- **Optional**: **source escrow** for insolvency only (law firm holds tarball)—does **not** give bank daily source access.

They get **control of data location** and **policy**; you keep **IP** and **recurring revenue**. That is how Okta, Datadog agents, and bank middleware are sold.

### 3.4 Private deploy: Docker bundle (what ships, what does not)

Customers **never** receive the Salanor monorepo or unrelated products. You build from one repo; you ship a **curated set of images** (or equivalent) per release.

```text
  salanor monorepo (Git — Salanor only)
        │
        │  CI: build selected Nx projects → OCI images
        ▼
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐
  │  stoa-web    │  │ stoa-gateway │  │  salanor-id  │  │ stoa-migrate│
  │  (chat UI)   │  │ (API + DLP)  │  │  (SSO/org)   │  │  (Job, once)│
  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘
        │                   │                  │
        └───────────────────┴──────────────────┘
                    Helm chart / compose
                    customer Postgres (any supported host)
                    LICENSE_KEY + BYOK in their vault
```

| Artifact | Purpose | Included in bank bundle? |
|----------|---------|---------------------------|
| **`stoa-web`** | Next.js governed chat + staff-facing settings | **Yes** |
| **`stoa-gateway`** | OpenAI-compatible API, threads/messages, policy, DLP, audit, license check | **Yes** |
| **`stoa-migrate`** | Database migrations (run on deploy/upgrade) | **Yes** |
| **`salanor-id`** | Login, org, SAML/OIDC, JWT for humans | **Yes** (typical enterprise); or customer IdP-only mode later |
| **Admin / compliance console** | Policies, exports, user admin | **v1:** routes on gateway or small **`stoa-admin`** image; not full Aegis console |
| **`web-marketing`, `web-platform`, `insurance-api`, pilot-agent, n8n, …** | Other Salanor lines | **No** |

**One image vs many:** **Multiple images**, one **Helm chart** (or documented compose). UI and gateway **scale and patch independently** but deploy to the **same trust zone** (§3.1).

**Image contents:** Compiled runtime (Node + bundled JS), static assets, entrypoint—not TypeScript sources, tests, or the rest of the company codebase. Subscription enforced via **LICENSE_KEY**, registry access, and contract (§3.3).

**Infrastructure portability (private):**

| Config | Customer choice |
|--------|-----------------|
| `DATABASE_URL` | Any **Postgres 15+** they operate (Azure Database for PostgreSQL, RDS, on-prem) |
| Blob storage (Phase 2 uploads) | Azure Blob, S3, etc. via env |
| LLM | **BYOK** — Azure OpenAI in their tenant preferred for banks |
| Neon / Fly / Vercel | **Salanor SaaS only** — not required for private |

### 3.5 Chat UX: v1 parity vs consumer apps (proposal language)

Use this table in RFPs and security reviews so expectations match delivery.

**Positioning:** Stoa matches **how people already work** with ChatGPT-class tools; it is **not** a pixel-perfect clone of a consumer product, and **enterprise defaults differ** (isolated threads, no silent cross-chat memory).

| Experience | Stoa v1 (launch target) | Later (roadmap) | Consumer ChatGPT / Claude (reference) |
|------------|-------------------------|-----------------|--------------------------------------|
| Work login (SSO) | Yes | SAML hardening | Personal account |
| **New chat**, sidebar **thread list** | Yes | Archive, search | Yes |
| **Multi-turn in one thread** (model sees prior messages in **that** chat) | Yes | Long-context tuning, summarization | Yes |
| Streaming replies | Yes | — | Yes |
| **Model picker** (OpenAI, Anthropic, …) | Yes (tenant-allowed models) | Per-team policy | Yes |
| **One workspace**, not separate app per provider | Yes | — | Single app, multiple models |
| DLP before send | **Yes (differentiator)** | Custom dictionaries, NER | No / limited |
| Rename / delete thread | Yes | Retention automation | Yes |
| File upload + scan | Phase 2 | — | Yes |
| **Memory across different chats** | **No (default off)** | Optional **tenant-controlled** “user memory” or **org knowledge** (RAG)—explicit policy | ChatGPT Memory / Projects |
| **Thread A reads thread B** | **No** | Only if customer enables shared project/knowledge feature | Projects, some memory features |
| Voice, Canvas, custom GPTs, deep research | No | Selective if demanded | Yes (consumer) |
| Lock model per thread vs switch mid-thread | Product choice (recommend **lock per thread** in v1) | — | Often flexible |

**Assurance script (honest):**

> “Within each conversation, Stoa **remembers the full thread** and answers in context—like the tools your staff already use. **Each conversation is separate by default**, which is what compliance usually wants between matters or cases. We do **not** promise every consumer bell (Memory, Projects, voice) in version one; we promise **familiar chat**, **your domain**, **DLP**, and **audit**.”

**Why default-no cross-chat memory:** Banks and law firms often **must not** blend unrelated matters. Consumer “Memory” is a **product feature**, not a baseline for governed enterprise chat.

---

## 4. What the gateway is (plain + technical)

### Plain language

The **gateway** is the **front door to OpenAI, Anthropic, etc.** inside the bank. Anything that would call `api.openai.com` instead calls **your gateway URL**. Before the request leaves the bank’s trust zone (or your dedicated tenant), Salanor runs **identity check → policy → redaction → audit → forward to provider**.

Employees using the chat website **use the same path**; they never bypass DLP because the UI does not talk to OpenAI directly.

### Technical shape (what you build)

| Piece | Description |
|-------|-------------|
| **Protocol** | HTTP(S); **OpenAI-compatible** REST + SSE streaming so existing SDKs work with `baseURL` change |
| **Auth** | Bearer token (service accounts) or session JWT from `salanor-id` (humans via web) |
| **Inline steps** | Policy evaluate → DLP transform request body → emit audit event → call provider with BYOK → optional response scan → return stream |
| **Not** | A generic “API management” product (Kong-only) with no DLP; not a VPN by itself |

### What Salanor builds it with (aligned to monorepo today)

| Layer | Technology (target) |
|-------|---------------------|
| **Gateway + admin APIs** | Node.js **Fastify** service (new `services/safe-ai-api` or module in `aegis-api`), same patterns as ingest/audit |
| **Policy + DLP** | TypeScript services; v1 regex/dictionaries; Postgres-backed rules per tenant |
| **Audit** | Reuse **Aegis-style signed events** / ingest pipeline where possible |
| **Auth / org / SSO** | **`services/id`** (`salanor-id`): OIDC today; SAML for enterprise |
| **Chat UI (Stoa)** | **`apps/web-workspace`** (Next.js on Vercel or customer **`stoa-web`** image) |
| **Database** | **Neon Postgres** (multi-tenant or dedicated branch per enterprise) |
| **Dedicated / private deploy** | **Docker images + Helm/Terraform** → Fly dedicated machines, **Azure Container Apps**, or customer **AKS/EKS** |
| **Secrets** | Env + KMS (Fly secrets, Azure Key Vault, customer HSM integration on private tier) |

You are **not** asking the bank to run custom glue per sale—you ship **versioned containers** and **migrations**, same as Cloudflare AI Gateway or Roder, with **optional** private deploy.

---

## 5. Commercial model — subscription, not “we sold you everything”

### Default (what almost every customer buys)

**Software as a service (subscription)** — annual or multi-year contract.

| Customer receives | Customer does **not** receive (default) |
|-------------------|----------------------------------------|
| Right to use **web UI + gateway + admin** for licensed seats / API volume | **Source code** or fork rights |
| **Dedicated tenant** or **private deploy** of **Salanor-built binaries/images** | Ownership of Salanor IP |
| **Updates, security patches**, SLA support | Right to resell the platform |
| **Configuration**: policies, SSO, custom domain, BYOK | Internal copy of your **policy engine** source |
| **Audit exports**, DPA, architecture pack for vendor review | Unlimited perpetual use without renewal |

**Revenue model (intentional):**

| Line item | Typical structure |
|-----------|-------------------|
| **Platform fee** | Per seat/month **or** platform minimum + included seats (enterprise) |
| **Gateway** | Included in enterprise platform fee, or **API call / token throughput** tier above threshold |
| **Setup / onboarding** | One-time (SSO, custom domain, policy workshop, security questionnaire) |
| **Private deploy** | Higher setup + **annual platform fee** (you operate updates) or **managed private** premium |
| **Model spend** | **Always BYOK** at bank scale—customer pays OpenAI/Azure directly |
| **Professional services** | Custom dictionaries, SIEM integration, legal hold—scoped SOW |

**One-time “buy the software forever” without subscription** is **not** the default—it destroys support, patches, and recurring revenue. If a buyer demands it, treat as **exception**: large **perpetual license fee** + **mandatory annual maintenance** (20–22% of license) or decline.

### When source code or “they host everything” enters

| SKU | What runs where | Source code |
|-----|-----------------|-------------|
| **Business SaaS** | Salanor multi-tenant | No |
| **Enterprise Dedicated** | Salanor-operated single-tenant (EU/agreed region), **their domain** (CNAME) | No — **containers + config** |
| **Enterprise Private (managed)** | Customer Azure/subscription; Salanor deploys and patches **images** | No — **license to run images** + support |
| **Enterprise Private (self-operated)** | Customer K8s team runs Helm chart | Still **no source** by default; **binary + docs** |
| **Source escrow / custom** | Only if contract requires (regulator, acquisition) | **Escrow agent** or **negotiated source license** — premium, rare |

**Selling “web + gateway” does not mean “here is the GitHub repo.”** It means: **licensed access to the running platform** (Salanor-hosted or customer-hosted **from your builds**).

### What the bank’s IT “has access to”

| Asset | Access |
|-------|--------|
| **Admin console** | Full policy and user control in **their** tenant |
| **Audit logs / exports** | Their data |
| **BYOK keys** | Stored in **their** vault or tenant-scoped encryption; Salanor routes, does not own keys |
| **Network** | They point DNS, SSO, and internal apps at **gateway URL** |
| **Containers (private tier)** | Pull from **your registry**; they see **image digest**, not TypeScript tree |
| **SOC2 / architecture PDF** | Yes — for procurement |

---

## 6. Enterprise SKUs (repeatable sales sheet)

| SKU | Best for | URL | Hosting | Typical contract |
|-----|----------|-----|---------|------------------|
| **Business** | 10–500 staff, law/insurance/SME | `{org}.salanor.com` or CNAME | Multi-tenant SaaS | Monthly/annual subscription |
| **Enterprise Dedicated** | Regional bank, large insurer | **`ai.customer.com`** | Single-tenant DB + compute | 1–3 year subscription + setup |
| **Enterprise Private** | Data sovereignty, “must run in our Azure” | **`ai-gw.internal.customer`** | Customer cloud, Salanor images | 3 year + premium support |
| **Add-on: Endpoint** | Managed browsers | N/A | Policy via extension | Add-on subscription |
| **Add-on: Aegis** | Live automation | Same gateway | Same tenant | Seat or action-based |

### 6.1 One company, one deployment (tenancy)

**Default rule:** **One legal customer = one Stoa tenant = one control-plane deployment** (one gateway + one web UI stack + one policy/audit database).

| Question | Answer |
|----------|--------|
| BK buys Stoa — how many deployments? | **One** for **Bank of Kigali (group)** unless legal/procurement requires separate entities. |
| Can all staff everywhere use it? | **Yes**, subject to **who IT allows in SSO** (e.g. Entra group `Stoa-Users`). Same URL (`ai.bk.rw`), same policies, same audit tenant. |
| Branches / countries | **Same tenant**; optional **second region** later for latency (still one logical org). Not one deploy per branch by default. |
| Subsidiaries / different banks | **Separate tenant + contract** each (e.g. BK vs sister company)—isolated data and billing. |
| Chat vs internal apps | **Same deployment, same gateway**—staff use web UI; IT points apps at `ai-gw…/v1`. |
| Rollout | Often **phased** (HQ → departments → all staff); license can cover **all eligible employees** while adoption ramps. |

**License ≠ adoption:** Contract can say “up to **N licensed users**”; IT enables groups over time. You bill on **committed N**, not daily active count (simpler for bank CFO).

### 6.2 Pricing model (intentional — two numbers + setup)

**Principles (founder / engineer / finance):**

1. **Never mark up LLM tokens at bank scale** — they **BYOK**; model invoice stays between bank and Microsoft/OpenAI. Stoa is **governance**, not a reseller.
2. **Predictable annual invoice** — banks hate surprise usage bills; cap or include gateway volume in the platform fee.
3. **Price what costs you** — support, private deploy ops, dedicated compute (SaaS), not their inference spend.
4. **Two numbers on the contract** (like mature EU gateways): **(A) platform package** + **(B) licensed users**. No five-dimensional SKU matrix.

**What the market does (simplified):**

| Vendor | Pattern |
|--------|---------|
| **ChatGPT Enterprise** | Per seat / month; model included in that product |
| **Roder** | Feature package + **request tier**, annual, **ceiling-bound**; enterprise custom |
| **Cloudflare AI Gateway** | Infra + request/log volume (often already CF customer) |
| **Stoa (recommended)** | **Annual platform** (hosting tier + support + gateway **included allowance**) + **committed seats** |

**Stoa invoice lines (all tiers):**

| Line | Type | Notes |
|------|------|--------|
| **Implementation / setup** | One-time | SSO, domain, policy workshop, private Azure deploy, security questionnaire |
| **Platform subscription** | **Annual** | Software + updates + license + SLA; includes **gateway + chat**; **fair-use API volume** (see below) |
| **Licensed users** | **Annual** (committed count or band) | Employees **entitled** to sign in; volume discounts by band |
| **Model usage** | **Not on Stoa invoice** (enterprise) | Customer ↔ provider directly |
| **Professional services** | Optional SOW | Custom DLP dictionaries, SIEM, migration |
| **Aegis add-on** | Separate when live | Platform fee or per **governed action**—define when Product B ships |

**Gateway quota (keep simple):**

- **Do not** sell chat seats and also nickel-and-dime every chat message.
- **Include** a large **monthly gateway request allowance** in the platform fee (e.g. **500k–2M requests/month** at bank tier—size to chat + moderate app traffic).
- **Overage** only if they use Stoa as **heavy automation bus** (optional **$X per 100k requests** above cap)—most BK deals never hit it in year 1.
- Engineering: meter requests for **visibility**, not as primary revenue lever.

**Indicative bands (USD, not binding — adjust in proposal):**

| Segment | Setup (one-time) | Platform (annual) | Licensed users (annual per user) |
|---------|------------------|-------------------|----------------------------------|
| **Business SaaS** | $1–2k | — | **$96–180** / user / year ($8–15/mo equiv.), min 10 |
| **Enterprise Dedicated** | $10–25k | **$36–72k** / year base | **$36–96** / user / year above included block (e.g. 500 included) |
| **Enterprise Private (BK-class)** | $25–50k | **$72–150k** / year base | **$24–60** / user / year for band e.g. **2k–5k** users (quote as **$120k–300k** all-in for 3k users rather than haggling cents) |

**How to quote BK without fancy math:** Pick a **user band** (e.g. 3,000 licensed), **private deploy**, one **all-in annual** (e.g. **$180k–250k/year** years 1–3) + setup, **renewal** tied to CPI or flat. Optional: **15% discount** for 3-year prepay.

**SME vs bank (same product, different packaging):**

- **Law firm 40 seats:** setup + **$12/user/mo** annual prepay — simple.
- **BK 3,000 seats:** **platform + band** — never quote 3,000 × consumer per-message pricing.

**What you do not sell:** Token margin, “credits”, per-model surcharges, SSO tax, separate gateway SKU for the same tenant.

---

## 7. Web on Salanor vs customer domain

| | `{org}.salanor.com` | **`ai.customer.com`** |
|---|-------------------|------------------------|
| Trust / phishing | External vendor feel | **Internal tool** |
| SSO | Acceptable for SME | **Expected** for bank |
| Procurement | Fine for boutiques | **Required** for tier-1/regional |
| Who operates DNS | Salanor | **Customer** (CNAME to dedicated tenant) |

**Implementation (Dedicated):** Customer issues TLS cert or uses their wildcard; CNAME to Salanor dedicated hostname; SSO SAML to Entra; **same codebase** as Business SKU.

**Implementation (Private):** Customer deploys UI container behind **their** ingress; UI env var `GATEWAY_URL=https://ai-gw.internal...`.

---

## 8. Salanor engineering roadmap (build once, three deploy modes)

### Phase 1 — Platform core

1. **`safe-ai-api`**: OpenAI-compatible gateway + internal API for chat UI  
2. **`web-workspace`**: chat client only calls gateway  
3. **DLP v1 + policy + metadata audit** (shared with Product A spec)  
4. **Multi-tenant** on Neon + Fly + Vercel  

### Phase 2 — Enterprise packaging

5. **Dedicated tenant** automation (DB branch, isolated app, custom domain)  
6. **SAML / Entra** via `salanor-id`  
7. **Logging tiers** (metadata-only default)  
8. **Security pack** (DPA, subprocessors, reference architecture PDF = this doc)  

### Phase 3 — Private deploy

9. **Helm chart**: gateway + worker + migrate job; external Postgres  
10. **Customer Key Vault** integration for BYOK  
11. **Optional extension** + IT runbook for DNS/proxy to gateway  

### Phase 4 — Aegis bridge

12. Same gateway enforces **tool/action policies** with witness/approval  

**Deploy modes = same images, different config:**

```text
  business.env     → shared Neon schema + shared Fly app (tenant_id in JWT)
  dedicated.env    → dedicated Neon + Fly app + custom domain
  private.env      → customer K8s + customer Postgres + Salanor image tags
```

---

## 9. Owner narrative (30 seconds)

> “We give you **your** AI front door—**your domain, your SSO, your model contracts**—and a **single gateway** so every chat and every application uses the **same rules**: sensitive data masked or blocked, everything auditable. You don’t get a science project; you get a **supported platform** we keep patched—running in our dedicated environment or **in your Azure** if you require it. When you automate workflows, the **same platform** adds approval and proof. One subscription, one story—not shadow ChatGPT.”

---

## 10. FAQ (internal sales / legal)

**Do they get the source if they buy gateway + web?**  
No, unless a **separate written source or escrow deal**. They get **licensed use** of the deployed product.

**Is it one-time or subscription?**  
**Subscription** (annual enterprise agreement). Perpetual only with **maintenance** or don’t sell it.

**What is the gateway in one line?**  
**Your OpenAI `base_url` with policy, DLP, and audit baked in.**

**Can they swap Salanor and keep policies?**  
Policies are **exportable config** (JSON/YAML); **engine** is Salanor IP—standard SaaS boundary.

**Does private deploy mean they own the product?**  
No—they **operate the deployment** (or you manage it); **license** remains with Salanor Ltd.

**Should UI and gateway be hosted by different parties?**  
**No.** Always **co-locate** in the same trust zone (see §3.1).

**One chat app or one per provider?**  
**One workspace**, many models via router (see §3.2).

**What Docker images do customers get?**  
**Multiple curated images** (`stoa-web`, `stoa-gateway`, …)—not the Salanor monorepo (see §3.4).

**Does Stoa work exactly like ChatGPT including Memory across chats?**  
**Same core loop** (threads + in-thread history); **not** full consumer parity—see §3.5.

---

*Document owner: Salanor product. **Stoa** enterprise architecture and licensing boundaries.*
