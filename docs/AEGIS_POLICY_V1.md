# Aegis Policy v1 (MVP)

**Status:** Shipped in P6 (engineering complete)  
**Updated:** 2026-05-16

## Purpose

Policy v1 provides a minimal, org-scoped rules layer for APS ingest events.  
Evaluation runs after APS schema validation and before ingest persistence/publish.

If policy denies an event, ingest returns `422` with structured violations.

---

## Rules schema

```json
{
  "version": "1",
  "require_fields": ["actor.id", "actor.type", "context.inputs", "context.outcome"],
  "deny_if_missing_actor": true,
  "max_payload_bytes": 32768
}
```

### Field definitions

- `version` (required): must be `"1"`.
- `require_fields` (optional): dot-path list that must exist and be non-empty in the APS event.
- `deny_if_missing_actor` (optional): when `true`, event must include `actor.id` and `actor.type`.
- `max_payload_bytes` (optional): max UTF-8 byte size of serialized APS event payload.

---

## Evaluation result contract

`evaluatePolicy(event, rules)` returns:

```ts
{
  allow: boolean;
  violations: string[];
}
```

When denied:

- Ingest responds `422`
- Response includes:
  - `error: "Policy denied event."`
  - `details: string[]`
  - `policy: { id, name, version }`
- Decision is recorded in `policy_evaluation_log`.

---

## Out of scope for v1

- Rich DSL / Rego / OPA integration
- Multi-version approval workflows and staged rollout controls
- Policy signatures backed by KMS/HSM or external trust service (Notary/Sigstore class)
- Automatic replay policy enforcement in every export/verify pipeline

---

## v1 shipped scope summary

- Ingest-time policy enforcement with deny-on-violation behavior (`422`)
- Org-scoped policy model + single-active versioning
- Console policy editor (admin/owner) with schema validation
- Replay-time on-demand checks (`POST /api/console/events/[id]/replay-check`)
- Policy evaluation log UI (`/console/policy/log`) with ingest/replay surfaces
- Signed manifest export + verification APIs and console UX

---

## Console editor (P6 Slice 2)

- Route: `/console/policy`
- API:
  - `GET /api/console/policy` (admin/owner)
  - `PUT /api/console/policy` (admin/owner; supports `dryRun` validation)
  - `POST /api/console/policy/enable` (admin/owner; optional enable/disable toggle)
- Save behavior:
  - Policy JSON must parse and satisfy schema v1 via `parsePolicyRules`
  - Active policy version increments and previous active version is disabled (single-active model)
  - Console audit records `policy_created` / `policy_updated`
- Viewer role remains read-only in UI.

---

## Replay-time policy checks (P6 Slice 3)

- API: `POST /api/console/events/[id]/replay-check`
- Purpose: evaluate currently active org policy against a stored ingest event payload on demand (read-only replay check).
- Response includes allow/deny + violations and policy identity when present.
- Replay evaluations are recorded in `policy_evaluation_log`; because the table has no metadata column yet, the `violations` JSON stores:
  - `surface` (e.g. `"replay"` or `"ingest"`)
  - `violations` (string array)
- Console UI: `/console/policy/log` shows recent policy evaluation entries across ingest and replay surfaces.

---

## Signed policy manifest (P6 Slice 4)

- Export API: `GET /api/console/policy/manifest` (admin/owner)
- Verify API: `POST /api/console/policy/verify-manifest` (viewer+)
- Signing key resolution:
  - `POLICY_SIGNING_KEY` (preferred)
  - fallback: `AUTH_SECRET`
- Manifest fields:
  - `organization_id`, `policy_id`, `name`, `version`, `rules`, `rules_sha256`, `created_at`
  - `signature: { alg: "hmac-sha256", value: <hex> }`
- Integrity checks in verification:
  - `rules_sha256` recomputed from canonicalized `rules`
  - HMAC signature verified from canonicalized manifest payload (excluding `signature`)
- Console UI:
  - Download manifest from `/console/policy`
  - Verify manifest by paste or JSON file upload

---

## Deferred to P6.5 / P7

- **P6.5 governance:** Rego/OPA DSL, approval workflows, staged rollout policies, auto-replay checks in verify/export pipelines.
- **P7 assurance:** stronger signature custody (KMS/HSM), external trust confirmations, policy provenance chain integration, and multi-anchor policy evidence linkage.
