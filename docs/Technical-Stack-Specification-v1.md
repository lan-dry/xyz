# Technical Stack Specification

**Product:** Governed operations hub (public brand TBD — *Secured by Salanor*)  
**Legal entity:** Salanor  
**Version:** 1.0  
**Date:** October 2026  
**Audience:** Engineering, DevOps, technical partners  

---

## 1. Overview

This document defines the **full target technology stack** for the platform: multi-tenant governed operations (sector packs, connectors, workflows, approvals, Salanor Aegis). Development follows **adapter-first architecture** — WooCommerce is connector #1, not the application core.

**Deployment target:** **Fly.io** for application runtime (API, workers, Next.js). Managed PostgreSQL and Redis on Fly or attached providers.

---

## 2. Architecture summary

```
                    ┌─────────────────────────────────────┐
                    │  Next.js (web + marketing + app UI) │
                    └─────────────────┬───────────────────┘
                                      │ HTTPS
                    ┌─────────────────▼───────────────────┐
                    │  NestJS API (REST + internal hooks)   │
                    └─────────────────┬───────────────────┘
          ┌───────────────────────────┼───────────────────────────┐
          │                           │                           │
          ▼                           ▼                           ▼
   PostgreSQL                   Redis (BullMQ)              Salanor Aegis API
   (tenants, canonical          job queue, retries,          policy check +
    data, approvals)            idempotency                  signed traces
          ▲
          │ webhooks / polling
          │
   External systems (WooCommerce, Shopify, Sheets, webhooks, ERP adapters)
```

**Processes on Fly.io (typical):**

| Fly app | Role |
|---------|------|
| `*-web` | Next.js (standalone build) |
| `*-api` | NestJS HTTP API |
| `*-worker` | BullMQ consumers (may merge with API for MVP) |

---

## 3. Monorepo structure

**Tooling:** pnpm workspaces + Turborepo  

```text
/
├── apps/
│   ├── web/                 # Next.js 15+ (App Router)
│   ├── api/                 # NestJS application
│   └── worker/              # Optional separate worker entry (BullMQ)
├── packages/
│   ├── domain/              # Canonical types, enums, policy interfaces
│   ├── db/                  # Prisma schema + client
│   ├── adapters-woocommerce/
│   ├── adapters-webhook/    # Generic inbound webhook adapter
│   ├── adapters-sheet/      # CSV/Sheets (phase supply chain)
│   ├── aegis-client/        # Salanor Aegis HTTP SDK
│   ├── email/               # Resend/Postmark templates
│   └── config-eslint/       # Shared lint/tsconfig
├── docker/
│   ├── Dockerfile.web
│   ├── Dockerfile.api
│   └── fly.toml examples
└── docs/
```

---

## 4. Frontend

| Layer | Technology | Notes |
|-------|------------|--------|
| Framework | **Next.js** (App Router) | Marketing site + authenticated app under `/app` |
| Language | **TypeScript** | Strict mode |
| UI | **Tailwind CSS** + **shadcn/ui** | Dashboard, connections wizard, approvals |
| Data fetching | **TanStack Query** | Server state, polling connection health |
| Forms | **React Hook Form** + **Zod** | Connection credentials, rules/caps |
| Auth UI | **Clerk** (recommended) or **Auth.js v5** | Organizations map to tenant model |

**Next.js deployment on Fly.io:** **Yes.** Build with `output: 'standalone'` in `next.config.js`, containerize, deploy as a Fly Machine. See Section 12.

---

## 5. Backend API

| Layer | Technology | Notes |
|-------|------------|--------|
| Runtime | **Node.js 22 LTS** | Align local + Fly |
| Framework | **NestJS** | Modules: `auth`, `organizations`, `connections`, `connectors`, `workflows`, `approvals`, `audit`, `webhooks` |
| HTTP | REST (JSON) | OpenAPI/Swagger generated for partners later |
| Validation | **class-validator** + **Zod** at boundaries | |
| Config | `@nestjs/config` + env validation | Secrets from Fly secrets |

**Alternative consolidation (MVP):** Single NestJS app serves REST; worker runs in same process via BullMQ worker module — split to `*-worker` Fly app when CPU load requires it.

---

## 6. Data layer

| Component | Technology | Purpose |
|-----------|------------|---------|
| Primary database | **PostgreSQL 16** | All persistent state |
| ORM | **Prisma** | Migrations, type-safe queries |
| Cache / queue backend | **Redis 7** | BullMQ, rate limiting, dedup keys |

### 6.1 Core entities (logical)

| Entity | Description |
|--------|-------------|
| `Organization` | Tenant; sector pack, billing plan |
| `User` | Belongs to org via membership + role |
| `Connection` | One integration instance (type, credentials ref, status) |
| `CanonicalOrder` | Normalized order from any adapter |
| `CanonicalStockLine` | SKU / product id, qty, threshold |
| `WorkflowRun` | Execution instance, status, payload ref |
| `ApprovalRequest` | Pending human decision |
| `AuditEvent` | Local index; Salanor trace id linkage |

All tenant tables include **`organization_id`** with row-level enforcement in services.

### 6.2 Credential storage

- WooCommerce API keys, webhook secrets: **encrypted at application level** before insert (AES-256-GCM; master key in Fly secrets).
- Never log secrets; rotate on reconnect.

---

## 7. Background processing

| Component | Technology | Purpose |
|-----------|------------|---------|
| Queue | **BullMQ** | Webhook processing, scheduled jobs, retry with backoff |
| Scheduler | BullMQ repeatable jobs | Weekly summary, SLA checks |
| Idempotency | Redis keys | `webhook:woo:{shop}:{orderId}:{status}` |

**Workflow engine:** TypeScript classes implementing steps (not visual n8n in production). Example: `LowStockWorkflow`, `PaidOrderAlertWorkflow`, `RefundProposalWorkflow` (v1.5).

---

## 8. Connector / adapter layer

**Interface (packages/domain):**

```typescript
export interface CommerceAdapter {
  readonly type: ConnectionType;
  testConnection(ctx: AdapterContext): Promise<void>;
  ensureWebhooks(ctx: AdapterContext): Promise<void>;
  mapOrder(source: unknown): CanonicalOrder;
  mapStock(source: unknown): CanonicalStockLine;
  executeAction?(action: ApprovedAction, ctx: AdapterContext): Promise<void>;
}
```

| Adapter | Phase | Inbound | Outbound (gated) |
|---------|-------|---------|------------------|
| **woocommerce** | MVP | REST + webhooks | Order notes, status, refunds (v1.5) |
| **webhook** | v1.5 | HTTP POST JSON | Optional callbacks |
| **google_sheet / csv** | v1.5 | Scheduled import | — |
| **shopify** | v2 | OAuth + webhooks | Same pattern as Woo |
| **odoo** (or partner ERP) | v2–v3 | XML-RPC/REST | PO/stock proposals |

Registry pattern in NestJS: `AdapterRegistry.get('woocommerce')`.

---

## 9. Salanor Aegis integration

| Step | When | Action |
|------|------|--------|
| Policy check | Before gated execute | `CheckPolicy` — tool id e.g. `commerce.refund.create` |
| Record run | After success/failure | `RecordRun` — link to `WorkflowRun.id` |
| Approval | Policy returns require_approval | Create `ApprovalRequest`; resume worker on approve |

**Package:** `packages/aegis-client` — typed HTTP client, retries, timeout 10s.

---

## 10. Email & notifications

| Channel | Provider | Phase |
|---------|----------|-------|
| Transactional email | **Resend** or **Postmark** | MVP |
| WhatsApp | Meta Business API or provider (e.g. Twilio) | v2 |

Templates: paid order alert, approval needed, weekly summary.

---

## 11. Observability & operations

| Concern | Tool |
|---------|------|
| Error tracking | **Sentry** (API + web + worker) |
| Logging | **pino** → stdout (Fly log aggregation) |
| Health | `GET /health`, `GET /ready` (DB + Redis) |
| Metrics | Fly metrics; Prometheus optional v2 |

---

## 12. Deployment — Fly.io

### 12.1 Can Next.js run on Fly?

**Yes.** Fly.io runs Docker images. Next.js uses **standalone output** for a minimal Node server in the container.

**next.config.js (essential):**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
};
module.exports = nextConfig;
```

**Dockerfile.web (pattern):** multi-stage build — `pnpm build`, copy `.next/standalone`, expose `3000`, `CMD ["node", "server.js"]`.

### 12.2 Typical Fly resources

| App | Dockerfile | Ports | Notes |
|-----|------------|-------|-------|
| `company-web` | `Dockerfile.web` | 3000 | Next.js |
| `company-api` | `Dockerfile.api` | 8080 | NestJS |
| `company-worker` | `Dockerfile.api` | — | Same image, different CMD |

**Fly Postgres:** `fly postgres create` or **Supabase/Neon** with private connection if preferred.  
**Fly Redis:** Upstash Redis (Fly integration) or self-hosted Redis machine.

**Secrets:** `fly secrets set DATABASE_URL=... REDIS_URL=... AEGIS_API_KEY=... ENCRYPTION_KEY=...`

**Regions:** Primary `lhr` or `cdg` for MVP; add **`jnb` (Johannesburg)** when POPIA/data residency is required.

### 12.3 CI/CD

| Stage | Tool |
|-------|------|
| CI | GitHub Actions — lint, test, build images |
| Deploy | `fly deploy` per app on main branch |
| Migrations | `prisma migrate deploy` in release command |

---

## 13. Security

| Topic | Approach |
|-------|----------|
| TLS | Fly edge termination |
| Auth | JWT/session via Clerk or Auth.js; API validates org membership |
| Webhooks | Verify WooCommerce signature where available; HMAC on generic webhook adapter |
| POPIA | Data processing agreement; document subprocessors (Fly, email provider, Clerk) |
| RBAC | `owner`, `ops`, `read_only` |

---

## 14. Environments

| Env | Purpose |
|-----|---------|
| `local` | Docker Compose: Postgres + Redis + api + web |
| `staging` | Fly apps `*-staging` |
| `production` | Fly apps production |

---

## 15. Testing strategy

| Level | Tool |
|-------|------|
| Unit | **Vitest** — domain, adapters mapping |
| API | **Supertest** + NestJS test module |
| E2E | **Playwright** — connect flow, approval UI |
| Contract | Fixture JSON from real Woo webhooks (sanitized) |

---

## 16. Version matrix (pin in repo)

| Dependency | Version policy |
|------------|----------------|
| Node | 22 LTS |
| Next.js | 15.x stable |
| NestJS | 11.x |
| PostgreSQL | 16 |
| Redis | 7 |
| TypeScript | 5.x |

---

## 17. Phase alignment (engineering)

| Phase | Stack focus |
|-------|-------------|
| **MVP** | Next + Nest + Prisma + BullMQ + Woo adapter + Aegis + Fly deploy |
| **v1.5** | Refund write-back, webhook adapter, separate worker if needed |
| **v2** | Shopify adapter, Sentry dashboards, optional `jnb` region |
| **v3** | ERP adapter, Temporal (if long-running sagas required) |

---

## 18. Related documents

- `PRD-Platform-Requirements-and-Specification-v1.md` — product requirements and behaviour  
- API specification (future): OpenAPI export from NestJS  

---

*End of Technical Stack Specification*
