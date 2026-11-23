# Ready to sell — 12-point checklist

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Single launch branch / provenance merged | **Verified** | `STAGE_0_REPORT.md` |
| 2 | Tenant isolation tests in CI path | **Verified** | `tenant-isolation.test.ts` in quality-gate aegis-api suite |
| 3 | Rate limits + clear 429 + usage page | **Partly verified** | rate-limit helpers + `/aegis/usage`; not all quota 429 paths live-smoked |
| 4 | Staging promote gate | **Not verified** | Script exists; staging stack not smoked |
| 5 | Monitoring /ops page | **Partly verified** | `OPERATIONS.md` + existing `/ready` |
| 6 | Backup restore drill | **Not verified** | Founder must run `pnpm launch:restore-check` |
| 7 | Managed key default / REQUIRE_MANAGED_KEY | **Partly verified** | Code in production-guards; prod flag not flipped live |
| 8 | Secrets hygiene / ENV.md | **Partly verified** | ENV.md + existing gitleaks CI |
| 9 | Sandbox tenant type + Ops + expiry emails | **Partly verified** | Migration 016 + Ops; expiry emails **captured** in `_raw/sandbox-expiry-email-test.json` (Resend live still founder) |
| 10 | Sign-up approval + email verify | **Partly verified** | Access request + Ops approve; Resend verify not live |
| 11 | Onboarding + test sender + quickstarts | **Verified** (quickstarts CI) | `_raw/quickstart-run-latest.json`; quality-gate runs `pnpm launch:quickstarts` |
| 12 | Stranger test (CI) | **Verified** (automated) | `_raw/stranger-run-latest.json` + bundle; human UI walk still recommended |

## Also from earlier prompts (status)

| Item | In this PR? |
|------|-------------|
| Realistic bank rules / demo.banking pack | **Already on main** (not introduced by Gate 0/1); pack apply + bank-sim stories. Not a Gate 1 gap. |
| Case “Decided by” when `decision_source` present | **Still open** for case pages. Approvals UI has Approved/Declined/Decided by; case/trace page shows Rule + approval actor, not a `decision_source` field (none in schema). |
| Demo tenants Ops page | **Already in PR / on main** — `apps/web-platform/.../demo-tenants` + platform API populate/wipe/reset. |

## Founder manual steps (exact)

1. Paste **DEMO_RUNBOOK v2** text when ready → replace `docs/DEMO_RUNBOOK.md`.  
2. Apply migration 016 on prod/staging: `MIGRATION_DATABASE_URL=… pnpm db:migrate`.  
3. Create staging stack per `STAGING.md`; run `pnpm launch:release-staging`.  
4. Set `REQUIRE_MANAGED_KEY=true` only after `AEGIS_RECEIPT_KMS_KEY_ID` works (`pnpm smoke:kms`).  
5. Configure Resend; test invite to corporate + Gmail; attach notes under `_raw/`.  
6. Run `pnpm launch:restore-check` with Neon PITR scratch branch.  
7. Optional human stranger walk; file `docs/launch/_raw/stranger-human-YYYYMMDD.md`.  
8. Legal review of sandbox terms / synthetic-data banner.  
9. DNS + TLS for staging domains.  
10. Lawyer / DPA checklist for first design partner (outside this repo).
