# Threat model (short) — Aegis forensic / bank path

Status: living document. Lists what is and is not covered today.

## Assets

- Sealed APS-1 events (hash chain, signatures)
- Derived forensic receipts (cite sealed events; tenant sequence)
- Policies (published content_hash)
- Approval decisions and access logs
- Ingest API keys and signing keys

## Actors

- Bank core / automation (machine, ingest key)
- Approvers and auditors (console session / SSO)
- Tenant admin
- External attacker (network, stolen key, insider)

## Threats and mitigations

| Threat | Mitigation today | Gap |
|--------|------------------|-----|
| Tamper receipt fact | Receipt hash + signature; `aegis-verify` | Need full APS seal link on every bank path |
| Swap/remove receipt | Tenant seq + prev_hash checks | Append-only on receipt table (migration 015) |
| Self-approval | SoD guard | Must be wired on all approval HTTP paths |
| Clear national ID in logs | Field policy mask/hash/evaluate_only | End-to-end log scrub not proven for all writers |
| Demo clock abuse in prod | `AEGIS_DEMO_MODE` + DB URL guard | Operators must not set allow flags in prod |
| Stolen local signing key | KeyProvider; local file refused in prod | AWS KMS Sign path incomplete |
| Cross-tenant read | Org scoping on queries | Continuous review of new endpoints |

## Not covered yet

- Formal penetration test
- Full RFC 3161 trusted time in production
- Certification (SOC 2 / EU AI Act are **mappings**, not certifications)
- Physical HSM attestation
- Supply-chain SBOM enforcement beyond planned CI (P7)
