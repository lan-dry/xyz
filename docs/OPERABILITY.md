# Operability and security leftovers (T2.9)

| Item | Status | How to verify |
|------|--------|---------------|
| Structured logs, no sensitive fields | **Partial / present** | Approval notify logs omit loan PII; field policy masks at ingest |
| Prometheus metrics | **Present if wired** | Check `/metrics` on aegis-api when observability package enabled |
| Startup config validation | **Partial** | Demo mode + production refuse; LocalFileKeyProvider refuses production |
| Rate limits + request size | **Present** | Ingest rate limit env; Hono body limits on routes |
| Secure headers | **Present** | Platform middleware / Next headers |
| Non-root containers | **Checklist** | Confirm Dockerfiles `USER` non-root before release |
| Secret scanning + SBOM in CI | **Partial** | OpenAPI smoke workflow present; add gitleaks + SBOM job before merge |

Do not claim FedRAMP/HIPAA authorization or absolute latency SLAs.
