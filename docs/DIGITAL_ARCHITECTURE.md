# Digital architecture — Salanor & Attest

**Version:** 2.0 · **Aligns Website Spec v2.0 canonical paths**

This document reconciles earlier subdomain brainstorming with **`Salanor_Website_Specification.pdf`**.

---

## 1) Canonical public information architecture

**Primary host:** `https://salanor.com`

| Path | Purpose |
|------|---------|
| `/` | Home |
| `/about` | Company story |
| `/attest` | Flagship product marketing |
| `/attest/docs` | Technical documentation index (**Phase 2 public launch** per Website Spec note) |
| `/aether` | Research programme |
| `/research` | Research index |
| `/research/[slug]` | Article |
| `/customers` | Case studies (when permitted) |
| `/standards` | APS-1 public draft |
| `/careers` | Roles (DB-backed) |
| `/contact` | Routed form |
| `/legal/*` | Privacy, terms, security disclosure, subprocessors |

**Global nav (5):** Attest · Aether · Research · About · Careers — **Contact** persistent secondary CTA (per spec).

---

## 2) Attest product subdomains (same `apps/web` deploy)

Marketing hosts are **first-class product URLs** (middleware rewrite, not 301 to `salanor.com`):

| Host | Public path | Internal route |
|------|-------------|----------------|
| `attest.salanor.com` | `/` | `/attest` |
| `attest.salanor.com` | `/pricing` | `/attest/pricing` |
| `attest.salanor.com` | `/docs` | `/attest/docs` |
| `attest.salanor.com` | `/console` | `/console` (same app) |
| `docs.attest.salanor.com` | `/` (+ paths) | `/attest/docs` (+ suffix) |

Configure `MARKETING_HOSTS`, `ATTEST_PUBLIC_HOST`, `ATTEST_DOCS_PUBLIC_HOST`, and `CONSOLE_PUBLIC_HOST` in `.env` / Vercel. Unknown hosts are rejected (see **`docs/HOST_ROUTING.md`**). Corporate paths (`/attest`, `/attest/pricing`, …) remain valid on `salanor.com` and `localhost` for dev.

---

## 3) Authenticated console (Attest product UI)

**Recommended host:** `https://app.attest.salanor.com` **or** path `https://salanor.com/console` **only if** cookie isolation complexity accepted.

Default:** separate subdomain + separate Next deploy target** (`apps/console-attest`) for session boundary clarity.

| Surface | Purpose |
|---------|---------|
| Login / SSO | Auth.js (`@salanor/auth`; SAML at `AUTH-A5`) |
| Tenant switcher | Organizations |
| API keys | Hashed secrets display-once UX |
| Event search | Read path (later phases) |
| Evidence export job status | Compliance viewer role |

Cross-origin: configure **CORS**, **cookies `SameSite`** explicitly.

---

## 4) Internal Salanor admin

**Recommended:** `https://admin.salanor.com` (same Auth.js app; admin allowlist via `AUTH-A1`).

Handles:

- CMS publish workflow for research posts (if not Git-only at first)  
- View `contact_messages` triage  
- Impersonation **NOT** in early phases (requires legal + audit design)

---

## 5) Technology mapping (summary)

| Layer | Stack |
|-------|--------|
| Marketing | Next.js + Nx + Tailwind v4 + MDX |
| Search | Pagefind |
| DB | Neon Postgres + Prisma |
| Auth | Auth.js (`@salanor/auth`) — see `AUTH_ROADMAP.md` |
| Email | Postmark / Buttondown |
| Analytics | Plausible |
| Attest backends | Containers + NATS + object storage |

---

## 6) Preview & SEO mechanics

Implement per Website Specification §13 (`<title>` length, OG, JobPosting schema, RSS).

---

## 7) Deprecated / superseded notions

Older proposals privileging **`docs.attest.salanor.com` as canonical** are **secondary** unless marketing strategy pivots — **Website Spec paths win** unless product marketing decides otherwise (**document change + version bump**).
