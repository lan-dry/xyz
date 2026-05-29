# Salanor — Documentation index

**Version:** 1.0 · **May 2026**

Read in this order for execution:

| # | Document | Purpose |
|---|----------|--------|
| 1 | **`PROJECT.md`** | Constitution: vision, repos, toolchain, Definition of Done, links to authoritative specs |
| 2 | **`INFRASTRUCTURE_DECISIONS.md`** | Locked hosting: Neon + Auth.js (`@salanor/auth`) + Vercel + Attest backends; portability rules |
| 2b | **`AUTH_ROADMAP.md`** | Auth stages A1–A5 (magic link → OAuth → 2FA → RBAC → SAML); committed, sequenced |
| 3 | **`DIGITAL_ARCHITECTURE.md`** | URLs, IA alignment with Website Specification, marketing vs console vs docs |
| 4 | **`DATA_MODEL_WEB.md`** | Postgres/Prisma CMS-light schema (`Salanor_Website_Specification.pdf`) |
| 5 | **`DATA_MODEL_ATTEST_CONSOLE.md`** | Tenancy, memberships, keys, billing placeholders — Attest SaaS boundary |
| 6 | **`ACCESS_CONTROL_MATRIX.md`** | Roles (internal vs tenant), resources, audit expectations |
| 7 | **`THREAT_MODEL.md`** | Evolving adversary/control mapping (draft v0.1) |
| 8 | **`FUNCTIONAL_REQUIREMENTS_SPEC.md`** | Full backlog: Attest PDF + Policy pillar + Website spec — phased FR IDs |
| 9 | **`IMPLEMENTATION_PLAN.md`** | Milestones, dependencies, sequencing → completion |
| 9b | **`DEFERRALS.md`** | Founder-facing deferred decision log with concrete pull-forward triggers post P6 |
| 10 | **`ATTEST_PHASE_0.md` … `ATTEST_PHASE_6.md`** | Executable acceptance criteria per release slice |
| 10b | **`ATTEST_POLICY_V1.md`** | Policy v1 contract: rules schema, editor/replay/manifest APIs, and deferred governance scope |

External authoritative inputs:

- **`Attest_Product_Specification.pdf`** — product MVP + roadmap wording
- **`Salanor_Website_Specification.pdf`** — public site copy + IA + stack + CMS schema
- **`Salanor_Website_Design.pdf`** — visuals/layout only (not copy source)

**Change control:** Bump doc version + changelog line when altering locked decisions.
