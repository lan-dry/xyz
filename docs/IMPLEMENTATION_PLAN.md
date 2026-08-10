# Implementation plan (macro sequencing)

**Version:** 1.0**

Phases align with **`AEGIS_PHASE_0.md` … `AEGIS_PHASE_6.md`**.

Dependency graph (simplified):

```
P0 Foundations & local aegis slice
 │
 ├──────────────┐
 ▼              ▼
P1 Web+CMS       P2 Minimal cloud ingest path (bridge)
 │
 └──────► P3 Backend MVP backbone (collector+bus+ledger+anchor+export)
           │
           ├──► P4 Console + tenancy + RBAC + keys
           │        │
           │        └──► P5 Evidence polish + Tier-B path
           │                 │
           │                 └──► P6 Policy engine + roadmap features
```

---

## Phase summaries

| Phase | Goal | Primary exit criterion |
|-------|------|------------------------|
| P0 | Engineering bedrock + **local** APS-like recording/replay demos | OSS repo public; CI green; DX story reproducible README |
| P1 | **salanor.com** stack live (staging) Spec-compliant pages + CMS + Auth.js admin (`AUTH-A1`) | `/contact` → DB + Slack; Lighthouse baseline |
| P2 | Narrow cloud path (dev ingestion) bridging SDK → persisted remote event prototype | Demonstrate single multi-hop write durability test |
| P3 | **Aegis PDF MVP backbone** parity (managed + hybrid alpha) | **Done (engineering)** — E2E smoke, OTS reconcile, S3 blobs, Tier C witness; Rust collector → P3.5 |
| P4 | Tenant **console**, RBAC enforcement, api keys hashed | Tenant isolation fuzz tests passing |
| P5 | Production hardening Tier B exploratory + operational SLO dashboards | Incident runbooks drafted |
| P6 | **Aegis Policy** + roadmap (multi-anchor etc.) prioritized by ADRs | GA feature flags documented |

---

## Workstream ownership (founding team draft)

| Workstream | Lead skill |
|-----------|-------------|
| Web & Editorial | Frontend + DX writer |
| Data & Prisma | Backend TS |
| Aegis Collector/Bus/Ledger | Rust + infra |
| Security | Fractional reviewer (eventually FTE) |

---

## Critical path risks

| Risk | Mitigation |
|------|-----------|
| Complexity overload before web credibility | Maintain P1 parallel once P0 core path stable weekly |
| Anchor integration delays | Maintain local-hash interim milestones (flag in FR) |
| RBAC regressions | Contract tests gated in CI |

---

## Cadence suggestion

Weekly checkpoint: milestone burn-down + demo recording (Loom).

---

## Document updates required at each milestone

- FUNCTIONAL_REQUIREMENTS_SPEC status transitions  
- ACCESS_CONTROL_MATRIX if roles expand  
- THREAT_MODEL.md delta review  
- **`AUTH_ROADMAP.md`** status column when auth stages A1–A5 ship or move (e.g. enterprise SAML pull-forward)

---

## Auth workstream (cross-cutting, not optional)

See **`AUTH_ROADMAP.md`**. Product phases **do not replace** auth stages:

| Auth stage | Typical alignment |
|------------|-------------------|
| A1 magic link + admin | **P1** (now) |
| A2 Google/GitHub OAuth | After P1 gate or early **P2** |
| A3 2FA + sign-in audit | Before console GA (**P4**) |
| A4 org membership + RBAC | **P4** |
| A5 SAML (WorkOS) | **P6** or first enterprise deal |
