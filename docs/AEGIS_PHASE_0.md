# Aegis Phase 0 — Foundations & Local Developer Slice

**Phase ID:** P0  
**Objective:** Produce a **credible, testable spine** engineers can fork without provisioning cloud cryptography infrastructure.

---

## Scope IN

| Area | Deliverable |
|------|-------------|
| Monorepo | Nx bootstrap (`apps/` placeholder web stub optional) |
| Packages | Minimal TypeScript `/` Python aegis SDK scaffolding |
| APS-1 | Draft JSON defining **minimal required fields subset** internally versioned `0.1` pending public freeze |
| Local recording | `record()` persists append-only NDJSON **or** sqlite file with stable ordering |
| Replay | CLI or script reconstructs deterministic Tier-A toy examples |
| CI | Lint + tests + semantic PR checks |
| Spec drift guard | APS example events committed as fixtures |
| OSS readiness | LICENSE (Apache-2.0 default unless legal override), SECURITY.md skeleton |

---

## Scope OUT

| Item | Deferred |
|------|----------|
| NATS / Rust collector | P3 |
| Public anchor | P3 |
| Auth.js admin + Neon prod | P1 (`AUTH-A1`) |
| Tenant console | P4 |

---

## Acceptance criteria

1. Contributor can run **`pnpm aegis:demo`** (or Makefile) generating ≥3 deterministic replay-equal runs.  
2. Unit tests cover schema validation rejections (`missing actor`, malformed signature placeholder).  
3. ` nx graph` cleanly lists projects.  
4. GitHub Actions: **green** main branch required check.  
5. Documented perf micro-benchmark (local-only) proving hot path negligible vs target architecture risk log.

---

## Exit artifacts

| Artifact | Location |
|---------|----------|
| Demo GIF / terminal capture | README |
| APS draft | `spec/aps/v0.1.json` |

---

## Dependencies

None (phase root).
