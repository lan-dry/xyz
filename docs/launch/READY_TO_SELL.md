# Ready to sell — 12-point checklist

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Single launch branch / provenance merged | **Verified** | `STAGE_0_REPORT.md` |
| 2 | Tenant isolation tests in CI path | **Partly verified** | `tenant-isolation.test.ts` in aegis-api suite |
| 3 | Rate limits + clear 429 | **Partly verified** | rate-limit copy + body size; usage UI incomplete |
| 4 | Staging promote gate | **Not verified** | Script exists; staging stack not smoked |
| 5 | Monitoring /ops page | **Partly verified** | `OPERATIONS.md` + existing `/ready` |
| 6 | Backup restore drill | **Not verified** | Founder must run `pnpm launch:restore-check` |
| 7 | Managed key default / REQUIRE_MANAGED_KEY | **Partly verified** | Code in production-guards; prod flag not flipped live |
| 8 | Secrets hygiene / ENV.md | **Partly verified** | ENV.md + existing gitleaks CI |
| 9 | Sandbox tenant type + Ops | **Partly verified** | Migration 016 + Ops pages; expiry emails not live |
| 10 | Sign-up approval + email verify | **Partly verified** | Access request + Ops approve; Resend verify not live |
| 11 | Onboarding + test sender + quickstarts | **Partly verified** | UI + docs; CI quickstart runner not done |
| 12 | Stranger test (human or CI) | **Not verified** | Script + skeleton only |

## Founder manual steps (exact)

1. Paste **DEMO_RUNBOOK v2** text when ready → replace `docs/DEMO_RUNBOOK.md`.  
2. Apply migration 016 on prod/staging: `MIGRATION_DATABASE_URL=… pnpm db:migrate`.  
3. Create staging stack per `STAGING.md`; run `pnpm launch:release-staging`.  
4. Set `REQUIRE_MANAGED_KEY=true` only after `AEGIS_RECEIPT_KMS_KEY_ID` works (`pnpm smoke:kms`).  
5. Configure Resend; test invite to corporate + Gmail; attach notes under `_raw/`.  
6. Run `pnpm launch:restore-check` with Neon PITR scratch branch.  
7. Run human stranger test; file notes under `_raw/`.  
8. Legal review of sandbox terms / synthetic-data banner.  
9. DNS + TLS for staging domains.  
10. Lawyer / DPA checklist for first design partner (outside this repo).
