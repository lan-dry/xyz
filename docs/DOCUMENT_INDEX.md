# Salanor — Documentation index

**Version:** 1.0 · **May 2026**

Read in this order for execution:

| # | Document | Purpose |
|---|----------|--------|
| 1 | **`PROJECT.md`** | Constitution: vision, repos, toolchain, Definition of Done, links to authoritative specs |
| 2 | **`INFRASTRUCTURE_DECISIONS.md`** | Locked hosting: Neon + Auth.js (`@salanor/auth`) + Vercel + Aegis backends; portability rules |
| 2a | **`PRODUCTION_DEPLOY.md`** | **Production runbook:** Neon + Fly.io + Vercel, env vars, deploy order, handoff guide |
| 2b | **`NEON_SETUP.md`** | Neon project link, CLI, MCP, env vars, migrations for Salanor Production |
| 2b | **`AUTH_ROADMAP.md`** | Auth stages A1–A5 (magic link → OAuth → 2FA → RBAC → SAML); committed, sequenced |
| 3 | **`DIGITAL_ARCHITECTURE.md`** | URLs, IA alignment with Website Specification, marketing vs console vs docs |
| 4 | **`DATA_MODEL_WEB.md`** | Postgres/Prisma CMS-light schema (`Salanor_Website_Specification.pdf`) |
| 5 | **`DATA_MODEL_AEGIS_CONSOLE.md`** | Tenancy, memberships, keys, billing placeholders — Aegis SaaS boundary |
| 6 | **`ACCESS_CONTROL_MATRIX.md`** | Roles (internal vs tenant), resources, audit expectations |
| 7 | **`THREAT_MODEL.md`** | Evolving adversary/control mapping (draft v0.1) |
| 8 | **`FUNCTIONAL_REQUIREMENTS_SPEC.md`** | Full backlog: Aegis PDF + Policy pillar + Website spec — phased FR IDs |
| 9 | **`IMPLEMENTATION_PLAN.md`** | Milestones, dependencies, sequencing → completion |
| 9b | **`DEFERRALS.md`** | Founder-facing deferred decision log with concrete pull-forward triggers post P6 |
| 10 | **`AEGIS_PHASE_0.md` … `AEGIS_PHASE_6.md`** | Executable acceptance criteria per release slice |
| 10b | **`AEGIS_POLICY_V1.md`** | Policy v1 contract: rules schema, editor/replay/manifest APIs, and deferred governance scope |
| 10c | **`AEGIS_N8N_INTEGRATION.md`** | Workflow Bridge for n8n/Zapier: server-signed runs, least-effort bookends |

External authoritative inputs:

- **`Aegis_Product_Specification.pdf`** — product MVP + roadmap wording
- **`Salanor_Website_Specification.pdf`** — public site copy + IA + stack + CMS schema
- **`Salanor_Website_Design.pdf`** — visuals/layout only (not copy source)

**Change control:** Bump doc version + changelog line when altering locked decisions.
