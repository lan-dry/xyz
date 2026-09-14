# Remaining work

**Single file for what is not done yet.**  
What we already shipped since the [implementation plan](./IMPLEMENTATION_PLAN.md) is summarized at the end of that document.

**How to test what exists:** [DEV.md](../docs/DEV.md), [E2E_PARTNER_ONBOARDING.md](../docs/E2E_PARTNER_ONBOARDING.md), [PILOT_RELEASE_CHECKLIST.md](../docs/PILOT_RELEASE_CHECKLIST.md), [COMMANDS.md](../docs/COMMANDS.md).

**Marketing vs product:** [AEGIS_PRODUCT_POSITIONING.md](./AEGIS_PRODUCT_POSITIONING.md)

**Salanor staff app:** [PLATFORM_OPS.md](./PLATFORM_OPS.md) (`:3003` / `ops.salanor.com`).

---

## Marketing concepts — status (2026-05)

| Concept | Marketing doc | Product status | Notes |
|---------|---------------|----------------|-------|
| **Trace** | Full agent session | **Done** | List, detail, chain root, replay |
| **Span** | Step in trace | **Done** | DB + `span_tree`, trace timeline UI |
| **Event** | Atomic input/output/error in span | **Done** | Phase badges (Input/Output/Policy/…); `tool_call` + `result` pairing |
| **Signature** | HMAC-SHA256 chain | **Doc fix only** | APS-1 = **Ed25519 + hash chain** — do not implement HMAC |
| **Chain root** | Session anchor hash | **Done** | Console + exports |
| **Provenance claim** | Signed authority assertion | **Done** | SDK + console panels |
| **Intercept everything** | Passive, all APIs | **SDK only** | `wrapFetch`, `record*` — see positioning doc |
| **Search / replay / export** | Cloud dashboard | **Done** (org scale) | PG FTS; audit replay; compliance ZIP |
| **Cloud re-run** | Replay agent in cloud | **Later** | Audit replay + local re-run manifest only |

---

## 1. Do now (pilots)

**Status:** **Pilot-ready** for design-partner calls. Optional items below are not blockers unless you are turning on production signup, billing, or enterprise SIEM in the same week.

| Item | Pilot-facing? | Status |
|------|----------------|--------|
| **Console + Platform Ops UI** | **Yes — main pilot** | **Ready** — [PILOT_WALKTHROUGH.md](../docs/PILOT_WALKTHROUGH.md), [INVESTOR_DEMO.md](../docs/INVESTOR_DEMO.md) |
| **Reference agent (`pnpm pilot:agent`)** | **Yes** | **Ready** — `pnpm dev` + org API key + `pnpm pilot:ensure-policy` |
| **Trace timeline (span → events)** | **Yes** | **Ready** — trace detail “Trace timeline” + event phase badges |
| **Self-serve signup + email verify** | Optional | **Shipped** — `/signup`; verify before console |
| **Compliance exports UX** | **Yes** | **Ready** — side panel guide, pending worker banner, `pnpm compliance:worker` |
| **Logs pagination + filters** | **Yes** | **Shipped** |
| **Members pagination** | Optional | **Shipped** (B-205) |
| **Ingest + login rate limits** | Prod | **Shipped** — env-tunable; add edge/WAF for GA |
| **Error monitoring** | Prod | **Shipped (optional)** — `SENTRY_DSN` on API/ID; set in staging |
| **SIEM destinations UI** | Optional | **Shipped** — Settings → Integrations (OTLP endpoints) |
| **Threat model P0** | Internal | **Draft** — [security/threat-model-p0.md](./security/threat-model-p0.md) |
| **Stripe go-live** | Optional | **Not done** — needs Stripe keys + `pnpm dev:billing` |
| **Update external marketing PDF** | Sales | **Not done** — align HMAC → Ed25519, intercept → SDK |

### §1 complete?

**For a pilot demo:** **Yes** — run the checklist below; ignore Stripe and marketing PDF until you need them.

**For production GA:** **No** — still need: Stripe (if billing), marketing doc alignment, `SENTRY_DSN` + edge rate limits, and a full staging run of `pilot-gate` / [PILOT_RELEASE_CHECKLIST.md](../docs/PILOT_RELEASE_CHECKLIST.md).

**Before a pilot call:**

```bash
pnpm dev
pnpm pilot:ensure-policy
pnpm pilot:agent
```

Open trace → **Trace timeline** → deny event → **Replay** → **Exports** → optional **Settings → Integrations** for SIEM.

**Developer-only sanity checks:** `pnpm pilot:phase-a`, `pnpm pilot:e2e`, `pnpm pilot:plan-limit`.

---

## 2. Product depth (P2 — when a customer needs it)

| ID | Item |
|----|------|
| B-201 | ML / AI on events (anomaly, risk, summaries) |
| B-202 | Auto-detect rich provenance in payloads — **lite shipped**; full ML detection open |
| B-203 | Full OPA/Rego policy editor (only if prospect requires Rego) |
| B-204 | Policy obligation UX at scale (queues, SLA dashboards) |
| B-205 | ~~Members pagination~~ **Shipped** |
| B-206 | SOC 2 Type II submission automation |
| B-207 | Transparency log + **OpenSearch** at high volume / fleet search |
| B-208 | SOC 2 Type I automation (beyond current exports) |
| B-209 | ~~Support impersonate org~~ **Shipped** |
| B-210 | **Cloud agent re-run** (sandboxed LLM/tools on Salanor) |
| B-211 | Dashboard usage graphs |
| B-212 | **Passive intercept** (sidecar / universal proxy / DB tap) |

**Intentionally not planned for pilots:** public marketing signup → instant prod console; rich analytics dashboard (counts only today).

---

## 3. Enterprise & platform scale (P3+)

| ID | Item |
|----|------|
| B-301 | Policy marketplace |
| B-302 | BYOC / on-prem |
| B-303 | SSO / SAML |
| B-304 | Insurance (Aether) production |
| B-305 | FedRAMP / air-gap |

---

## 4. Infrastructure

| ID | Item |
|----|------|
| B-401 | Full EKS / ArgoCD production |
| B-402 | SpiceDB / Zanzibar AuthZ |
| B-403 | immudb |
| B-404 | Threat model P0 — **draft** [security/threat-model-p0.md](./security/threat-model-p0.md); formal review before GA |

---

## 5. Developer tooling (nice-to-have)

| ID | Item | Workaround |
|----|------|------------|
| B-503 | Hosted API reference (OpenAPI) | **In progress** — `apps/web-docs` at `:3002` |
| B-501 | `pnpm demo:approval` root script | `pnpm demo:full-system` or console Approvals |
| B-502 | OPA WASM rebuild docs polish | `pnpm --filter aegis-api policy:build-wasm` |

---

## Automated checks (already green locally when stack is up)

```bash
pnpm pilot:phase-a
pnpm pilot:e2e
pnpm pilot:plan-limit
pnpm billing:usage-backfill   # optional usage reconcile
```

---

## What to do next (recommended order)

1. **Run pilot gate on staging** — `pnpm db:migrate`, `pilot-gate` CI or local [PILOT_RELEASE_CHECKLIST.md](../docs/PILOT_RELEASE_CHECKLIST.md).  
2. **One live dry-run** — investor/partner script with trace timeline + deny + export download.  
3. **Prod env** — `SENTRY_DSN`, `COMPLIANCE_EXPORT_DIR`, daily `pnpm compliance:worker` cron.  
4. **Sales** — update marketing PDF (Ed25519, SDK instrumentation).  
5. **First paying customer triggers** — SSO (B-303), SIEM auth headers, B-204 approvals at scale, or OpenSearch (B-207) per deal.

