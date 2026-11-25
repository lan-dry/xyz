# Stage 1 report — Gate 0 safety + Gate 1 sandbox (update)

| Item | Status | Notes |
|------|--------|-------|
| Tenant isolation suite | **Done** | Anonymous full inventory + authenticated Org A↛B; in aegis-api suite / quality-gate |
| Rate limits / 429 | **Done** | Per-org ingest + export hourly; sandbox daily/storage hard 402 |
| Console usage page | **Done** | `/aegis/usage` |
| Monitoring hooks | **Done** | `/metrics`, `/v1/ops/status`, `ALERT_WEBHOOK_URL` |
| Staging docs + script | **Done** | `STAGING.md`, `scripts/release-staging.mjs` — staging stack not smoked live |
| Neon restore command | **Done (script)** | Founder must run once for **live** |
| REQUIRE_MANAGED_KEY | **Done (code)** | Prod flag not flipped live |
| ENV.md + gitleaks | **Done** | Outbound email gated by `AEGIS_EMAIL_ENABLED` |
| Self-serve sandbox (Gate 1) | **Done** | Sign-up, banner, checklist, test sender, reset, samples, Postman, stranger |
| Gate 2 code-only | **Done** | Record-only default, Decided by, feeds UI, CHN-AGT rule |

## Verification (this machine)

- `pnpm --filter aegis-api test` — **698 passed**, 1 skipped
- `pnpm launch:stranger` — **ok** (`docs/launch/_raw/stranger-run-latest.json`)
- `pnpm launch:quickstarts` — **ok** (curl, TS, python fallback, connector-docker contract, Postman)
- Connector / ledger / bank-sim / id / insurance / sdk / verify / py — passed in focused runs
