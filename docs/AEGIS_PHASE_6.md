# Aegis Phase 6 — Aegis Policy + Roadmap Expansion

**Phase ID:** P6  
**Status:** Engineering complete (deferments tracked)  
**Updated:** 2026-05-16

---

## Streams

### A. Aegis Policy (enforcement)

| Deliverable |
|-------------|
| Versioned signed rules manifests |
| SDK evaluation hook emits `policy.allow` / `policy.deny` events |
| Default-deny connectors flag set |
| Optional ML-assisted anomaly AFTER rule baseline |

### B. Architectural roadmap (prioritized backlog)

Ordered selection from FUNCTIONAL_REQUIREMENTS § roadmap cluster:

| ID | Feature |
|----|---------|
| FR-AEG-V11-MULTIANCHOR | Secondary chain anchor redundancy |
| FR-AEG-V11-STREAM | Streaming long traces |
| FR-AEG-V12-AIRGAP | Packaging for sovereign customers |
| FR-AEG-V20-GRAPH | Decision provenance DAG queries |

Selections require **ADR** per item.

---

## Exit criteria GA readiness

Independent security assessment (tier appropriate) completed with tracked remediations under SLA.

---

## Dependencies

Demonstrable Tier A/C revenue path + operational maturity from P5.

---

## P6 implementation tracker (current branch)

### Slice 1 — Policy engine MVP v1

- [x] Add policy persistence model (`aegis_policies`) scoped per organization
- [x] Add policy evaluation audit model (`policy_evaluation_log`)
- [x] Implement policy evaluator with v1 rules (`require_fields`, `deny_if_missing_actor`, `max_payload_bytes`)
- [x] Integrate ingest-time policy enforcement after APS validation (deny returns HTTP 422)
- [x] Add console policy page (`/console/policy`) with active policy JSON + template
- [x] Add tests for evaluator logic and ingest deny integration
- [x] Add policy schema doc (`AEGIS_POLICY_V1.md`)

### Slice 2 — Policy editor (admin+)

- [x] Add policy management API (`GET/PUT /api/console/policy`) with admin/owner RBAC gate
- [x] Add optional policy enable toggle API (`POST /api/console/policy/enable`)
- [x] Validate policy JSON via `parsePolicyRules` before save (invalid JSON/rules rejected)
- [x] Enforce single-active policy model and version increment on save
- [x] Add console audit actions (`policy_created`, `policy_updated`)
- [x] Upgrade `/console/policy` to editor for admin+ with viewer read-only behavior
- [x] Add validation UX and template load flow in policy editor
- [x] Add policy API RBAC + validation tests

### Slice 3 — Replay policy + policy audit

- [x] Add replay-time policy evaluation helper (`evaluatePolicyForReplay`)
- [x] Add replay-check API (`POST /api/console/events/[id]/replay-check`) for stored events
- [x] Log replay evaluations to `policy_evaluation_log` with `surface: "replay"` encoded in violations payload
- [x] Add policy evaluation log UI at `/console/policy/log` (last 50 entries)
- [x] Link policy log from `/console/policy`
- [x] Add events page badge when active policy is enforced at ingest
- [x] Add replay-check route tests

### Slice 4 — Signed policy manifest (MVP)

- [x] Add versioned policy manifest structure with rules hash + HMAC signature
- [x] Add manifest export API (`GET /api/console/policy/manifest`) for admin/owner
- [x] Add manifest verification API (`POST /api/console/policy/verify-manifest`) for viewer+
- [x] Add `/console/policy` controls for manifest download and verification (paste/upload)
- [x] Add sign/verify roundtrip + tamper detection tests
- [x] Add `POLICY_SIGNING_KEY` env support with `AUTH_SECRET` fallback
- [x] Update policy docs for manifest workflow

---

## P6 completion summary

Policy v1 engineering scope is complete for this phase: ingest enforcement, policy editing, replay checks, evaluation audit visibility, and signed manifest export/verification are shipped in the console/API stack.  
Remaining scope is intentionally deferred and tracked in `DEFERRALS.md` (advanced DSL/governance, roadmap platform work, and enterprise hardening flows).

### Deferred in P6 (documented, not shipped in this slice)

- [ ] Multi-anchor expansion beyond current OTS/stub baseline
- [ ] Rust collector workstream expansion
- [ ] Complex policy DSL / Rego integration
- [ ] Policy version management UI + approval workflows
