# Functional requirements specification (master backlog)

**Version:** 1.0 · **Coverage:** Attest Product Specification · Salanor Website Specification v2 · Attest Policy pillar · Access & data models

Each requirement has `Phase` tag: **P0 … P6** (see `IMPLEMENTATION_PLAN.md`).

Status values: `planned` | `building` | `done` | `dropped` (rare; needs ADR)

---

## Legend

| Phase | Scope (summary) |
|-------|----------------|
| P0 | Foundations: local SDK slice, repo, CI, APS-1 subset |
| P1 | Corporate web + CMS-light + Auth.js admin shell (`@salanor/auth`, `AUTH-A1`) + Neon |
| P2 | Minimal cloud ingest path (dev → prod shape) |
| P3 | PDF **MVP backbone** (collector + bus + ledger + anchor + replay/export) |
| P4 | Tenant console + RBAC hardening + API keys |
| P5 | Evidence pipeline polish + SLA hooks |
| P6 | **Attest Policy** enforcement + analytics + roadmap v2 features |

*(Phases mirrored in ATTEST_PHASE_*.md files.)*

---

# Part A — Corporate web & editorial (Website Spec)

### Global / Brand

| ID | Requirement | Phase |
|----|-------------|-------|
| FR-WEB-DES-IA | Routes match **DIGITAL_ARCHITECTURE.md** (canonical `/attest`, `/research`, ...) | P1 |
| FR-WEB-Voice | Editorial tone obeys Spec §15 guardrails | P1 |
| FR-WEB-Perf | Lighthouse budgets §13 honored on key routes | P1 |

### Homepage `/`

| ID | Requirement | Phase |
|----|-------------|-------|
| FR-WEB-HOME-HERO | Hero + sections per Spec copy blocks | P1 |
| FR-WEB-HOME-CTA | Primary & secondary CTA links functional | P1 |

### `/about`

| ID | Requirement | Phase |
|----|-------------|-------|
| FR-WEB-ABOUT | Copy + principles + team placeholder | P1 |

### `/attest`

| ID | Requirement | Phase |
|----|-------------|-------|
| FR-WEB-ATTEST-HERO | Full flagship copy incl. **four primitives** explainer | P1 |
| FR-WEB-ATTEST-CODE | Sample snippet (TS) matches documented SDK import path | P1 |
| FR-WEB-ATTEST-CTA | Request access + technical overview links | P1 |

### `/aether`

| ID | Requirement | Phase |
|----|-------------|-------|
| FR-WEB-AETHER | Programme description + tracks grid | P1 |

### `/research` + `/research/[slug]`

| ID | Requirement | Phase |
|----|-------------|-------|
| FR-WEB-RES-INDEX | Index layout + RSS link | P1 |
| FR-WEB-RES-MDX | MDX rendering + reading time + OG | P1 |

### `/careers`

| ID | Requirement | Phase |
|----|-------------|-------|
| FR-WEB-JOBS | List from `open_roles` table (status open) | P1 |
| FR-WEB-JOB-JSONLD | JobPosting schema | P1 |

### `/contact`

| ID | Requirement | Phase |
|----|-------------|-------|
| FR-WEB-CONTACT-ROUTES | Four routed reasons mapping to ENUM | P1 |
| FR-WEB-CONTACT-STORE | Persist `contact_messages` + Slack notify | P1 |
| FR-WEB-CONTACT-ABUSE | Rate limit + honeypot + optional Turnstile | P1 |

### Authentication (`@salanor/auth`)

| ID | Requirement | Phase |
|----|-------------|-------|
| FR-AUTH-MAGIC | Email magic link + Prisma sessions (`AUTH-A1`) | P1 |
| FR-AUTH-OAUTH | Google + GitHub OAuth; same email → same `User` via Auth.js `Account` (`AUTH-A2`) | P1 / early P2 |
| FR-AUTH-ADMIN | Admin allowlist (`ADMIN_EMAILS`, `sal_internal_users`) gates `/admin` | P1 |

### `/standards`

| ID | Requirement | Phase |
|----|-------------|-------|
| FR-WEB-APS-PUBLIC | APS-1 draft excerpt / link MDX rendered | P2 |

### Legal

| ID | Requirement | Phase |
|----|-------------|-------|
| FR-WEB-LEGAL-PRIVACY | GDPR baseline copy | P1 |
| FR-WEB-LEGAL-SECURITY | Disclosure policy skeleton | P1 |

### Observability Web

| ID | Requirement | Phase |
|----|-------------|-------|
| FR-WEB-SENTRY | Frontend + API route errors tracked | P1 |
| FR-WEB-OTE | Minimal OpenTelemetry instrumentation | P2 |

---

# Part B — Attest product (capture / anchor / replay / export)

### APS-1 schema & SDK

| ID | Requirement | Phase |
|----|-------------|-------|
| FR-APS-SCHEMA-V1 public draft | Minimal JSON Schema published | P0/P2 |
| FR-APS-SDK-TS | Typed `attest.record` surface | P0→P4 |
| FR-APS-SDK-PY | Idiomatic Python package | P0→P4 |
| FR-APS-SDK-GO | Go module | P3 |
| FR-APS-HTTP-FALLBACK | JSON POST shim for polyglot | P3 |

### Local developer slice (pre-cloud)

| ID | Requirement | Phase |
|----|-------------|-------|
| FR-ATT-LOCAL-REC | Record calls append structured events locally | P0 |
| FR-ATT-LOCAL-REPLAY | Deterministic reconstruction Tier A simple path | P0 |
| FR-ATT-LOCAL-VERIFY-CLI stub | Early integrity check (hash chain local) | P0 |

### Cloud ingest bridge (P2 prototype)

| ID | Requirement | Phase |
|----|-------------|-------|
| FR-ATT-P2-INGEST | Authenticated `POST /api/attest/ingest` persists APS events to Postgres | P2 |
| FR-ATT-P2-REMOTE | SDK `attest.recordCloud` posts validated events to ingest endpoint | P2 |

### Edge collector (hot path)

| ID | Requirement | Phase |
|----|-------------|-------|
| FR-ATT-COLLECT-LAT | p50/p99 latency targets from PDF §4 | P3 |
| FR-ATT-COLLECT-SIGN | Customer key signs inbound event | P3 |
| FR-ATT-COLLECT-BUF | Local disk buffer if bus down | P3 |

### Event bus

| ID | Requirement | Phase |
|----|-------------|-------|
| FR-ATT-BUS-ORDER | Ordered durable streams (NATS JetStream) | P3 |
| FR-ATT-BUS-SCALE | Horizontal scale baseline | P3 |

### Ledger writer

| ID | Requirement | Phase |
|----|-------------|-------|
| FR-ATT-LEDGER-MERKLE | Batch Merkle roots (250ms default) | P3 |
| FR-ATT-LEDGER-PG | Postgres persistence for events index | P3 |
| FR-ATT-LEDGER-OBJ | Large blob object storage content-addressed | P3 |

### Anchor service

| ID | Requirement | Phase |
|----|-------------|-------|
| FR-ATT-ANCHOR-OTS | OpenTimestamps Bitcoin anchoring default | P3 |
| FR-ATT-ANCHOR-CADENCE | Configurable anchor windows | P3 |

### Replay & export plane

| ID | Requirement | Phase |
|----|-------------|-------|
| FR-ATT-REPLAY-TIER-A | Deterministic replay | P3 |
| FR-ATT-REPLAY-TIER-C | Witness mode for externals | P3 |
| FR-ATT-REPLAY-TIER-B | Best-effort bounded LLM variance capture | P5 |
| FR-ATT-EXPORT-PACK | Signed PDF+JSON evidence pack | P3 |
| FR-ATT-VERIFY-OSS | Offline verify CLI | P3 |

### Admin UI (product)

| ID | Requirement | Phase |
|----|-------------|-------|
| FR-ATT-UI-SEARCH | Event search | P3 |
| FR-ATT-UI-DRILL | Single decision drill-down | P3 |
| FR-ATT-UI-EXPORTJOB | Generate pack job UX | P4 |

### Deployment topologies

| ID | Requirement | Phase |
|----|-------------|-------|
| FR-ATT-DEP-MGD | Managed regions (US-East, EU-West baseline) | P3 |
| FR-ATT-DEP-HYBRID | Helm hybrid chart | P3 |
| FR-ATT-DEP-AIRGAP | Deferred post MVP (PDF out-of-scope) | P6 |

### Roadmap PDF extras

| ID | Requirement | Phase |
|----|-------------|-------|
| FR-ATT-V11-MULTIANCHOR | Multi-chain anchors | P6 |
| FR-ATT-V11-STREAM | Streaming replay long traces | P6 |
| FR-ATT-V12-AIRGAP | Air-gapped self-host | P6 |
| FR-ATT-V13-TIERB-GA | Tier B GA + provider hooks | P6 |
| FR-ATT-V20-GRAPH | Cross-system provenance graph | P6 |

---

# Part C — Attest Policy (enforcement / authorization gate)

| ID | Requirement | Phase |
|----|-------------|-------|
| FR-POL-SDK-HOOK | Pre-execution evaluation hook in SDK | P6 |
| FR-POL-RULE-ENGINE | Versioned ruleset fetch + cache | P6 |
| FR-POL-DECISION-EVENT | Each allow/deny recorded as APS-1 `policy.*` action | P6 |
| FR-POL-DENY-DEFAULT | High-risk connectors default closed if unset | P6 |
| FR-POL-ML-ASSIST-OPT | Optional anomaly assist **after** deterministic rules | P6+ |

---

# Part D — Console SaaS (tenancy & collaboration)

| ID | Requirement | Phase |
|----|-------------|-------|
| FR-CON-TENANT-ISO | Hard tenant isolation tests | P4 |
| FR-CON-RBAC | Membership roles implemented | P4 |
| FR-CON-KEYS | API key lifecycle (display once) | P4 |
| FR-CON-AUDIT | `console_audit_log` append-only | P4 |
| FR-CON-GUEST | Scoped guest reviewer tokens | P6 |
| FR-CON-BILL-STRIPE | Stripe billing (placeholder until GTM ready) | P6 |

---

# Part E — Security & compliance programme

| ID | Requirement | Phase |
|----|-------------|-------|
| FR-SEC-THREAT | Maintain `THREAT_MODEL.md` | P1 |
| FR-SEC-DEPENDABOT | Automated dependency updates | P1 |
| FR-SEC-CODEQL | Static analysis in CI | P2 |
| FR-SEC-DPA | DPA template availability | P4 |

---

# Part F — DevEx & quality

| ID | Requirement | Phase |
|----|-------------|-------|
| FR-DX-NX-AFFECTED | CI uses `nx affected` | P0 |
| FR-DX-CARGO | Rust services build matrix | P3 |
| FR-DX-PYTEST | SDK test harness | P0 |

---

## Traceability matrix (documents)

| Source | FR groups |
|--------|-----------|
| Website Spec | FR-WEB-* |
| Attest PDF MVP | FR-ATT-* (P3 core) |
| Attest PDF roadmap | FR-ATT-V* |
| Policy pillar | FR-POL-* |
| Console model | FR-CON-* |

---

## Change process

1. Propose FR with next free ID.  
2. Tag phase or justify reprioritization (ADR).  
3. Update **IMPLEMENTATION_PLAN** + relevant **ATTEST_PHASE_**.md acceptance lists.
