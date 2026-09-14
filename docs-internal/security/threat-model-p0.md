# Threat model — P0 (pilots)

**Status:** Draft for design-partner / staging  
**Scope:** Salanor Console, Salanor ID, Aegis API ingest + console, single-region Postgres  
**Out of scope:** FedRAMP, multi-tenant crypto isolation, passive network tap

---

## Assets

| Asset | Why it matters |
|-------|----------------|
| Ingest API keys | Forge events if leaked |
| Signing private keys (customer-held) | Non-repudiation of agent actions |
| Session cookies (`salanor_session`) | Org-scoped console access |
| Postgres (`event`, `trace`, audit tables) | Source of truth for compliance |
| Compliance export ZIPs on disk | Auditor evidence |

---

## Trust boundaries

1. **Customer agent runtime** → HTTPS → **Aegis API** (`/v1/aegis/events`) with Bearer ingest key  
2. **Browser** → HTTPS → **Console** (Next.js) → **Aegis API** / **Salanor ID** with session cookie  
3. **Ops cron** → `pnpm compliance:worker` on API host (filesystem access to `COMPLIANCE_EXPORT_DIR`)

---

## STRIDE (P0 highlights)

| Threat | Mitigation (shipped or required for prod) |
|--------|-------------------------------------------|
| **Spoofing** (fake events) | Ed25519 verify on ingest; org must match key; `key_id` bound to org |
| **Tampering** (DB row edit) | Per-event hash chain + witness Merkle + public verify |
| **Repudiation** | Signed events + audit log for console actions |
| **Information disclosure** | Org isolation on all console queries; redacted args in payloads |
| **DoS** | Ingest + login rate limits (per instance); WAF at edge in prod |
| **Elevation** | RBAC on console (`admin` for exports, SIEM, keys); platform staff impersonation audited |

---

## Pilot gaps (accept or close before GA)

| Gap | Risk | Action |
|-----|------|--------|
| Rate limits in-memory only | Bypass with many IPs | Edge rate limit + Redis optional |
| No SSO | Password reuse | B-303 when enterprise deal |
| SIEM auth_config unused | Endpoint spoof if URL wrong | Document TLS + vendor tokens in P2 |
| `SENTRY_DSN` optional | Blind to prod errors | Set in staging/prod |

---

## Verification

- `pnpm demo:verify-chain` / public `/verify` after ingest  
- Console → event → **Verify chain + inclusion**  
- Audit log for impersonation and key lifecycle  

**Review cadence:** Revisit when adding passive intercept, cloud re-run, or multi-region.
