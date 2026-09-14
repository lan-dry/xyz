# Infrastructure decisions (locked baseline)

**Version:** 1.0 · **May 2026** · **Owner:** Founder (Salanor)

This document freezes cross-cutting infrastructure choices credible for B2B/SaaS and portable enough to reduce founder regret.

---

## 1) Planes of operation

| Plane | Responsibility | Hosting pattern |
|-------|----------------|-----------------|
| **Web / CMS / Admin** | `salanor.com` surfaces, Postgres CMS-light (Prisma), admin auth | **Vercel** (edge SSR) |
| **Aegis backend** | Collector(s), buses, ledger writer, anchors, replay/export services | **Container platform** — default **Fly.io** (alternate: Railway/AWS ECS documented in runbooks) |
| **Object storage** | Content-addressed evidence blobs | **Cloudflare R2** or AWS S3 (S3-compatible) |
| **Product DB metadata** | Tenants, API keys (hashed), roles — **distinct** from APS-1 high-volume paths when scaling | Neon Postgres (recommended separate **logical DB** `aegis_app` vs `salanor_web`) |
| **Message bus** | Durable ordering for events | **NATS JetStream** (per Aegis specification) |

---

## 2) Primary vendor choices (recommended)

### 2.1 Postgres — **Neon** (recommended)

**Rationale**

- Hosted **Postgres 16** aligns with Website Specification (“industry-grade”) without bundling orthogonal services.
- **Branching / scale-to-zero** supports preview environments aligned with GitHub Actions.
- **Exit path:** standard logical dump / logical replication to RDS Cloud SQL etc.

**Operational requirements**

- Enable **Point-in-Time Recovery**.
- Separate **staging** branch or database from prod.
- **Connection pooling**: Neon pooled connection string + Prisma `directUrl` for migrations where required.

---

### 2.2 Authentication — **Auth.js** (`@salanor/auth`)

**Roadmap:** Stages A1–A5 (magic link → OAuth → 2FA → RBAC → SAML) are **committed work** — see **`AUTH_ROADMAP.md`**.

**Rationale**

- **Self-hosted, portable** session + email magic-link flow aligned with Neon Postgres (Prisma adapter).
- Monorepo library **`packages/auth`** (`@salanor/auth`) centralizes providers, allowlist, and future 2FA hooks; apps stay thin (route handler + middleware).
- Clear boundary: **authentication** with Auth.js; **authorization truth** in Postgres (`sal_internal_users`, tenant RBAC tables when Aegis console ships).

**Configuration guidance**

| Application | Recommendation |
|--------------|----------------|
| **Marketing / internal admin** (`salanor.com` `/admin`) | Auth.js **Nodemailer** (Postmark SMTP) + `ADMIN_EMAILS` env and/or `sal_internal_users` allowlist. |
| **Customer console** (future `app.aegis.*`) | Reuse `@salanor/auth`; org membership + RBAC in product DB (`AUTH-A4` in `AUTH_ROADMAP.md`). |

**MFA**

- Phase 2+: TOTP/WebAuthn extension points documented in `packages/auth/README.md` (`AUTH_EXTENSION_POINTS`).

---

### 2.3 Edge frontend hosting — **Vercel**

- Next.js SSR/edge aligns with Website Specification allowance (Next compatible).
- GitHub previews per PR; manual production approval gate (spec).

---

### 2.4 Email — **Postmark**

- Matches Website Specification (transactional).
- Dedicated domain & SPF/DKIM records.

---

### 2.5 Newsletter — **Buttondown**

- Per Website Specification — research mailing distinct from product email.

---

### 2.6 Static research search — **Pagefind**

- Per Website Specification.

---

### 2.7 Analytics / errors / tracing

| Concern | Service |
|---------|---------|
| Privacy analytics | **Plausible** |
| Error tracking | **Sentry** |
| Tracing | **OpenTelemetry** — export to chosen backend (Honeycomb/Otel Collector/Grafana Cloud) phased |

---

### 2.8 Rate limiting & abuse

**Upstash Redis** (or equivalent) behind edge middleware — contact & auth-sensitive routes first.

---

## 3) What we consciously **did not** pick as default spine

**Supabase** — credible (Postgres + RLS remains portable; avoid Edge Functions-heavy coupling). Deferred per portability preference until needed.

**Single VPS day zero** — valid for sovereignty deals or dev sandboxes later; **not** default SLA spine for internet-facing marketing SSO.

---

## 4) Secrets management

Production secrets **outside** plaintext `.env` in repo:

- **Doppler**, **AWS SSM Parameter Store**, or **1Password Secrets Automation** — pick one during Phase 1 implementation (document chosen tool in PROJECT.md appendix).

Rotation policy: API keys hashed at rest (**bcrypt/scrypt**) + metadata only logged.

---

## 5) Environment matrix

| Environment | Purpose |
|-------------|---------|
| `local` | Docker Compose Postgres (+ optional NATS); Mailpit; Auth.js dev secrets |
| `preview` | Vercel preview + Neon branch DB |
| `staging` | Parity rehearsal; seeded synthetic APS-1 events |
| `production` | Hardened, restricted admin access |

---

## 6) Compliance placeholders (truthful wording)

SOC2 / HIPAA language **only appears on site when programs exist** — link trust center footer per Website Specification roadmap.

---

## 7) Revisit triggers

Major version bump revisit when adding:

- Dedicated regional deployment (EU data residency mandates)
- Air-gapped / self-hosted Aegis binaries for enterprise
- Multi-cloud anchor redundancy
