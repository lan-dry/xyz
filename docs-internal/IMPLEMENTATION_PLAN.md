# Aegis / Salanor — Implementation Plan

**Status:** Approved for engineering start  
**Version:** 1.0  
**Date:** 2026-05-18  
**Source of truth:** Salanor Aegis Development Plan & Platform Blueprint v1.0 (canonical PDF)  
**Companion docs:** `docs-internal/adr/`, `docs-internal/aps/APS-1-draft-0.1.md`, `docs-internal/schema/v1/`

---

## How to read this plan

| Concept             | Meaning                                                                         |
| ------------------- | ------------------------------------------------------------------------------- |
| **Stage**           | A shippable increment with a single **exit test** (automated or scripted demo). |
| **Blueprint phase** | P0–P5 from §1.1 of the Platform Blueprint.                                      |
| **Done**            | Exit test passes in CI or staging; no known P0 security gaps for that stage.    |

**Rule:** Do not start stage N+1 until stage N exit test is green.

**Last stage (Stage 12)** means the **full product** per the blueprint phase map — not a single feature flag.

---

## Pre-coding checklist (Stage 0)

| #   | Artifact                            | Path                                        | Status                   |
| --- | ----------------------------------- | ------------------------------------------- | ------------------------ |
| 1   | Platform Blueprint (frozen)         | Copy PDF → `docs/blueprint.md`              | User                     |
| 2   | Implementation plan                 | `docs-internal/IMPLEMENTATION_PLAN.md`      | This file                |
| 3   | ADRs (slug, org, P0 auth)           | `docs-internal/adr/0001–0003`               | Done                     |
| 4   | APS-1 draft 0.1                     | `docs-internal/aps/APS-1-draft-0.1.md`      | Done                     |
| 5   | Database v1 (SQL + DBML + ERD HTML) | `docs-internal/schema/v1/`                  | Done                     |
| 6   | Threat model (P0 light)             | `docs-internal/security/threat-model-p0.md` | TODO before Stage 3 prod |
| 7   | Local dev contract                  | `docs/DEV.md`                               | Done (Stage 1)           |
| 8   | GitHub repo                         | `github.com/salanor-ltd/salanor`            | Done (Stage 1)           |

---

## Naming decisions (frozen)

See ADRs. Summary:

- **Product slug:** `aegis` (URLs, npm `@salanor/aegis`)
- **Isolation unit:** `organization` (DB table `organization`, FK `organization_id`) — not `tenant`
- **P0 console auth:** session + org scope; ingest uses **API keys**

---

## Stage map ↔ Blueprint phases

| Stage | Title                         | Blueprint phase | Primary exit test                                        |
| ----- | ----------------------------- | --------------- | -------------------------------------------------------- |
| 0     | Contract freeze               | —               | Team agrees on one signed event definition               |
| 1     | Monorepo skeleton             | P0 prep         | Clone → install → CI green → `docker compose up` healthy |
| 2     | Database v1                   | P0              | Migrations + tenant isolation integration test           |
| 3     | Sign + ingest + store         | **P0**          | Signed event E2E in staging; idempotency works           |
| 4     | Console v0 (read-only)        | P0              | User sees only their org’s events                        |
| 5     | MCP / proxy block-before-call | P1 alpha        | Denied tool never hits network mock                      |
| 6     | Policy engine (OPA)           | P1              | Rule change affects proxy without SDK redeploy           |
| 7     | Human approvals               | P1–P2           | Obligation → approve → tool runs → trace complete        |
| 8     | Witness + Merkle              | P1–P2           | Tamper old event → verifier fails                        |
| 9     | Transparency log + Go SDK     | P2 beta         | External verifier script passes                          |
| 10    | SIEM + compliance exports     | P2–P3           | Export bundle + OTel fixture                             |
| 11    | Platform extraction           | P3–P5           | Billing / console shell per §3.6                         |
| 12    | Full system verification      | P0–P5           | All phase exit gates in §1.1 checklist                   |

---

## Stage 0 — Contract freeze

**Goal:** No application code until contracts are readable by a new engineer.

### Steps

| ID  | Task                         | Owner    | Output                                  |
| --- | ---------------------------- | -------- | --------------------------------------- |
| 0.1 | Freeze blueprint PDF         | CTO      | `docs/blueprint.md`                     |
| 0.2 | Ratify ADR-0001 slug         | Eng      | `adr/0001-product-url-slug.md`          |
| 0.3 | Ratify ADR-0002 organization | Eng      | `adr/0002-organization-vs-tenant.md`    |
| 0.4 | Ratify ADR-0003 P0 auth      | Eng      | `adr/0003-p0-console-authentication.md` |
| 0.5 | Publish APS-1 draft 0.1      | Eng      | `aps/APS-1-draft-0.1.md`                |
| 0.6 | Publish schema v1            | Eng      | `schema/v1/001_initial.sql`             |
| 0.7 | P0 threat model (1–2 pages)  | Security | `security/threat-model-p0.md`           |

### Exit test

- [ ] Engineer can draw: SDK → sign → ingest → `event` row → console, on a whiteboard, without opening old repos.
- [ ] APS-1 example JSON validates against published JSON Schema (when added in Stage 1).

---

## Stage 1 — Monorepo skeleton

**Goal:** `salanor/salanor` exists with CI and local infra — **no product features**.

### Steps

| ID   | Task                                                                           | Output                               |
| ---- | ------------------------------------------------------------------------------ | ------------------------------------ |
| 1.1  | Create GitHub repo `salanor/salanor`                                           | Remote + branch protection           |
| 1.2  | Root tooling: `pnpm-workspace.yaml`, `nx.json`, `package.json`                 | Install works                        |
| 1.3  | `apps/web-console` (Next.js 15 empty shell)                                    | `/aegis` route placeholder           |
| 1.4  | `apps/web-marketing` (optional stub)                                           | `/products/aegis` placeholder        |
| 1.5  | `packages/config`, `packages/ui` (empty)                                       | Shared eslint/tsconfig               |
| 1.6  | `services/aegis-api` (choose Go **or** TS for P0 — document in ADR if changed) | Health `GET /health`                 |
| 1.7  | `packages/sdk-aegis` stub                                                      | `package.json` name `@salanor/aegis` |
| 1.8  | `docker-compose.yml`: Postgres 16, Redis 7                                     | `docker compose up`                  |
| 1.9  | GitHub Actions: lint + typecheck on affected (Nx)                              | Green on main                        |
| 1.10 | `docs/DEV.md`: clone, env, compose, test commands                              | New hire < 30 min                    |

### Exit test

```bash
git clone git@github.com/salanor-ltd/salanor.git
pnpm install && pnpm exec nx run-many -t lint --all
docker compose up -d && curl -f http://localhost:5432  # or service health
curl -f http://localhost:<aegis-api-port>/health
```

- [ ] All commands exit 0 on a clean machine.

---

## Stage 2 — Database v1

**Goal:** Schema migrated; org isolation proven.

### Steps

| ID  | Task                                                                   | Output                          |
| --- | ---------------------------------------------------------------------- | ------------------------------- |
| 2.1 | Apply `schema/v1/001_initial.sql` via Atlas or drizzle-kit             | Migration history               |
| 2.2 | Seed script: 1 `organization`, 1 `agent`, 1 `user`, 1 `ingest_api_key` | `tools/seed/dev.sql`            |
| 2.3 | Data access layer (sqlc or Drizzle) for org-scoped reads               | `services/aegis-api` repo layer |
| 2.4 | Integration test: org A cannot read org B events                       | CI test                         |

### Exit test

- [ ] `migrate up` + `migrate down` + `migrate up` succeeds.
- [ ] Integration test `TestOrgIsolation` passes in CI.

---

## Stage 3 — Sign + ingest + store (P0 exit gate)

**Goal:** **First signed event end-to-end in staging** (Blueprint §1.1 P0).

### Steps

| ID  | Task                                                                      | Output                   |
| --- | ------------------------------------------------------------------------- | ------------------------ |
| 3.1 | Implement APS-1 canonicalization (JCS) + Ed25519 verify in API            | `internal/canonical/`    |
| 3.2 | `POST /v1/aegis/events` (or gRPC equivalent): validate schema, sig, org   | OpenAPI handler          |
| 3.3 | Idempotency: `Idempotency-Key` header → `idempotency_record`              | 409/200 replay semantics |
| 3.4 | Hash chain: `prev_event_hash`, `event_hash`, `sequence_num` per org+agent | Tamper-evidence prep     |
| 3.5 | Dev signer (KMS stub OK in dev; KMS in staging)                           | `SIGNING_KEY` row        |
| 3.6 | `@salanor/aegis` SDK: `signAndIngest(event)`                              | npm package 0.1.x        |
| 3.7 | `tools/demo/ingest-one-event.mts`                                         | Documented demo          |

### Exit test

```bash
pnpm -C tools/demo ingest-one-event
psql -c "SELECT event_id, event_hash, chain_valid FROM event LIMIT 1;"
pnpm -C tools/demo verify-chain
# Repeat with same Idempotency-Key → same event_id, count still 1
```

- [ ] Demo script passes in staging.
- [ ] Invalid signature rejected with 401/422.
- [ ] Wrong org API key cannot write to another org.

**Blueprint P0:** ✅ when this stage exits.

---

## Stage 4 — Console v0 (read-only)

**Goal:** Operators see traces/events for their organization only.

### Steps

| ID  | Task                                                      | Output             |
| --- | --------------------------------------------------------- | ------------------ |
| 4.1 | Session auth (per ADR-0003) + `organization` context      | Middleware         |
| 4.2 | Pages: trace list, event detail, API keys (create/revoke) | `apps/web-console` |
| 4.3 | Wire to aegis-api read APIs                               | TanStack Query     |
| 4.4 | Deploy preview (Vercel) + Neon branch per PR              | Preview URL        |

### Exit test

- [ ] Login as org A → see Stage 3 demo events.
- [ ] Login as org B → empty or 403 (no cross-org leakage).
- [ ] Create ingest key in UI → demo script with new key works.

---

## Stage 5 — MCP / proxy (block before call)

**Goal:** SDK intercepts **one** tool call; **deny** blocks network (P1 alpha start).

### Steps

| ID  | Task                                                           | Output                     |
| --- | -------------------------------------------------------------- | -------------------------- |
| 5.1 | Proxy wrapper: `wrapFetch` or MCP middleware hook              | `packages/sdk-aegis/proxy` |
| 5.2 | Hardcoded deny rule: e.g. `stripe.paymentIntents.create`       | Integration test           |
| 5.3 | Emit `policy_decision` events: allow / deny                    | APS-1 `action_kind`        |
| 5.4 | Denied path: no outbound HTTP (mock server asserts zero calls) | Test                       |

### Exit test

- [ ] Test: deny rule → 0 outbound requests, 1 deny event in DB.
- [ ] Test: allow rule → 1 outbound request, allow + result events.

---

## Stage 6 — Policy engine (OPA)

**Goal:** Policies in DB; OPA WASM evaluates at proxy.

### Steps

| ID  | Task                                      | Output                        |
| --- | ----------------------------------------- | ----------------------------- |
| 6.1 | CRUD `policy` + `policy_rule` (admin API) | Console v1 policies page      |
| 6.2 | OPA bundle build from `rego_source`       | `services/policy` or embedded |
| 6.3 | Proxy calls OPA before tool execution     | Replace hardcoded deny        |

### Exit test

- [ ] Activate new policy version → proxy behavior changes without redeploying SDK consumer app.

---

## Stage 7 — Human approvals

**Goal:** `allow_with_obligation` pauses until human approves.

### Steps

| ID  | Task                                              | Output                |
| --- | ------------------------------------------------- | --------------------- |
| 7.1 | `approval` + `approval_channel` flows             | Web UI approve/reject |
| 7.2 | Trace status: `blocked` → `running` → `completed` | State machine test    |
| 7.3 | (Optional) Slack channel                          | Post-P1               |

### Exit test

- [ ] E2E: obligation → pending approval → approve → tool runs → trace completed.

---

## Stage 8 — Witness + Merkle

**Goal:** Periodic roots + inclusion proofs; tamper demo (Q3 alpha exit gate).

### Steps

| ID  | Task                                                       | Output                  |
| --- | ---------------------------------------------------------- | ----------------------- |
| 8.1 | `services/aegis-signer` (Rust): batch hash → `merkle_root` | Cron / stream           |
| 8.2 | `inclusion_proof` generator API                            | GET proof by `event_id` |
| 8.3 | Console: verify button                                     | UI                      |

### Exit test

- [ ] Modify historical `event` row in DB → `verify-chain` / inclusion check **fails**.
- [ ] Unmodified event → passes.

---

## Stage 9 — Transparency log + Go SDK (P2)

### Steps

| ID  | Task                                            | Output                         |
| --- | ----------------------------------------------- | ------------------------------ |
| 9.1 | Trillian / RFC 6962-style publish               | `transparency_log_entry`       |
| 9.2 | Go SDK on `github.com/salanor/salanor-go/aegis` | Published module               |
| 9.3 | DID:agent v0.1                                  | `did_document` table populated |

### Exit test

- [ ] Third-party `tools/verifier` (no internal imports) validates inclusion proof against public log.

---

## Stage 10 — SIEM + compliance exports (P2–P3)

### Steps

| ID   | Task                                      | Output                     |
| ---- | ----------------------------------------- | -------------------------- |
| 10.1 | OTel export to `siem_destination`         | Integration test with mock |
| 10.2 | `compliance_export` job worker            | S3 Object Lock artifact    |
| 10.3 | Bundles: SOC2, EU AI Act Art.12 templates | ZIP + integrity hash       |

### Exit test

- [ ] Request export for date range → `status=ready` + downloadable bundle + `integrity_hash` verifies.

---

## Stage 11 — Platform extraction (P3–P5)

Per blueprint §3.6 schedule:

| When    | Extract                                             |
| ------- | --------------------------------------------------- |
| Q4 2026 | Salanor ID (`services/id`) — if not already unified |
| Q1 2027 | Salanor Billing                                     |
| Q3 2027 | Salanor Console shell + product #2 folder           |

### Exit test

- [ ] Second product scaffolded under `services/<product>-api` + console routes only — no new GitHub repo.

---

## Stage 12 — Full system verification

**Goal:** Prove blueprint §1.1 phase exit gates, not “feature complete” gut feel.

### Phase checklist (from blueprint)

| Phase | Gate                                                 | Verified by          |
| ----- | ---------------------------------------------------- | -------------------- |
| P0    | First signed event E2E in staging                    | Stage 3              |
| P1    | 3 DPs writing real events; MCP proxy; p50 SDK < 5ms  | Stage 5 + metrics    |
| P2    | 5 paying; public log; SOC2 Type I; external verifier | Stages 9–10          |
| P3    | 15 tenants; BYOC; policy marketplace                 | Stage 11 + Terraform |
| P4    | $2M ARR; reinsurer pilot                             | Business metrics     |
| P5    | Second product on platform                           | Stage 11             |

### Final demo script (run in staging)

1. Start trace via SDK proxy → policy allow.
2. Attempt denied tool → blocked, event recorded.
3. Obligation tool → approve in console → completes.
4. Ingest signed chain → Merkle root published.
5. Download inclusion proof → verifier OK.
6. Trigger compliance export → bundle valid.
7. SIEM fixture receives OTel span.

- [x] Single `tools/demo/full-system.mts` runs all steps; documented in README.

---

## Test strategy summary

| Layer       | Tool                                      | When      |
| ----------- | ----------------------------------------- | --------- |
| Unit        | Vitest / go test / cargo test             | Every PR  |
| Integration | testcontainers (Postgres, Redis)          | Stages 2+ |
| E2E         | Playwright (console) + demo scripts       | Stages 4+ |
| Contract    | buf breaking + JSON Schema APS-1          | Stage 1+  |
| Security    | Semgrep, gitleaks (blueprint §6)          | Stage 1+  |
| Perf        | k6 on ingest p99 (P1: < 5ms SDK overhead) | Stage 5+  |

---

## Repo layout target (§5.1)

```
salanor/
├── apps/web-marketing/
├── apps/web-console/
├── apps/web-docs/
├── services/aegis-api/
├── services/aegis-signer/      # Stage 8+
├── services/id/                # Stage 11
├── packages/sdk-aegis/         # npm @salanor/aegis
├── packages/ui/
├── proto/
├── infra/
├── tools/demo/
├── docs/
└── docs-internal/              # this plan, ADRs, APS, schema
```

---

## What we explicitly defer

- Full EKS/ArgoCD production (use compose + Vercel previews until P2).
- FedRAMP, on-prem air-gap (P4).
- Insurance bridge production (P4).
- SpiceDB AuthZ (schema ready; wire when console RBAC needs it).
- immudb (not in blueprint).

---

## Revision history

| Version | Date       | Change                                           |
| ------- | ---------- | ------------------------------------------------ |
| 1.0     | 2026-05-18 | Initial plan from frozen Platform Blueprint v1.0 |
