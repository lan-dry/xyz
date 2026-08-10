# Aegis: marketing doc vs product (2026-05)

## Strategic answers

### 1. Passive “intercept everything” — stay on instrumented LLM + tools (for now)

**Recommendation:** Do **not** prioritize universal passive intercept for pilots. Stay focused on **LLM boundaries + policy-gated tools** (SDK).

Passive capture (sidecar, proxy all traffic, DB hooks) is a **platform bet** (months, ops burden). Your wedge is **litigation-ready proof** for high-risk actions (money, PII, approvals), not omniscient telemetry.

### 2. HMAC-SHA256 chained signatures — skip

**Recommendation:** **No.** APS-1 uses **Ed25519 + hash chain**; that is sufficient for non-repudiation. Switching to HMAC adds no customer value and breaks the standard.

### 7. Automatic data reads/writes — yes, via SDK (not passive)

**Recommendation:** **Yes for compliance narrative**, implemented as **`recordDataAccess()`** (shipped). Call at ticket/DB/vector boundaries. Passive DB tap is out of scope until enterprise demand.

### 5. Cloud “re-run agent” — phased

**Shipped (Phase 1):** Audit **replay walkthrough** (`/aegis/traces/:id/replay`) + manifest API.  
**Not shipped:** Salanor-hosted re-execution of LLM/tools (sandbox, secrets, cost). Partners re-run locally with the same keys.

### 8. Enterprise search — org-scoped FTS (Phase 1)

**Shipped:** `/aegis/search` with PostgreSQL `tsvector` over events.  
**Later:** OpenSearch, cross-region, SIEM-scale (B-207).

---

## Shipped in this phase (migration `016`)

| Feature | What |
|---------|------|
| **Span hierarchy** | `span` table, `event.span_id`, `span_tree` on trace detail |
| **Signed provenance claim** | `action_kind: provenance_claim` + `recordProvenanceClaim()` |
| **Decisions** | `action_kind: decision` + `recordDecision()` |
| **Data access** | `action_kind: data_access` + `recordDataAccess()` |
| **Search** | `GET /v1/console/search` + Search nav |
| **Replay** | `GET /v1/console/traces/:id/replay` + Replay UI |

Run: `pnpm db:migrate` then `pnpm pilot:agent` to see new event kinds on a fresh trace.
