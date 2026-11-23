# Stage 1 report — Gate 0 safety

| Item | Status | Notes |
|------|--------|-------|
| Tenant isolation suite | **Done** | `tenant-isolation.test.ts` in aegis-api suite / quality-gate |
| Rate limits / 429 | **Partly** | platform-auth rate-limit + body size; org usage UI at `/aegis/usage` |
| Console usage page | **Done** | `/aegis/usage` reads `organization/plan-usage` → `organization_usage_monthly` |
| Staging docs + script | **Done** | `STAGING.md`, `scripts/release-staging.mjs` — staging stack not smoked live |
| Monitoring / OPERATIONS | **Done** | docs + existing `/ready` |
| Neon restore command | **Done (script)** | Founder must run once for **live** |
| REQUIRE_MANAGED_KEY | **Done (code)** | Prod flag not flipped live |
| ENV.md + gitleaks | **Done** | |
