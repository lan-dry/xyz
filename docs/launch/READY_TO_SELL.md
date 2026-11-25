# Ready to sell — 12-point checklist

Honest status after Round 3. **Code on this branch ≠ live staging, managed keys, lawyer, or website.**

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Single launch branch / provenance merged | **Partly verified** | Tip `feature/provenance-g3-kms` is not an ancestor of `main`, but Ops Populate content is already on `main` (different SHAs). Evidence: `_raw/g3-kms-vs-main.json` — main is ahead on exceptions/permit/lock; abandoning the tip loses no Ops work |
| 2 | Tenant isolation tests in CI path | **Verified** (code) | `tenant-isolation.test.ts`; quality-gate runs `pnpm --filter aegis-api test` |
| 3 | Rate limits + clear 429 + usage page | **Verified** (code) | Per-org ingest + export limits; sandbox daily/storage refuse; `/aegis/usage` |
| 4 | Staging promote gate | **Not verified** | Script exists; staging stack not smoked on this pass |
| 5 | Monitoring / ops page | **Partly verified** | `/metrics` + `/v1/ops/status` now require ops token; alerts: witness, queue lag, **DB down**, **KMS error**, **5xx spike**. Webhook/phone delivery = founder |
| 6 | Backup restore drill | **Not verified** | Founder: `pnpm launch:restore-check` |
| 7 | Managed key default / REQUIRE_MANAGED_KEY | **Partly verified** | Guards in code; prod flag + live KMS not flipped here |
| 8 | Secrets hygiene / ENV.md | **Partly verified** | ENV.md + gitleaks CI; email off unless `AEGIS_EMAIL_ENABLED=1` |
| 9 | Sandbox tenant + Ops + expiry | **Verified** (code) | Migrations 016–019; banner; synthetic guard; quotas; starter pack seeds on approve/status/test-events |
| 10 | Sign-up approval + email verify | **Verified** (code) | `/request-access` → Ops approve → invite URL (email optional) |
| 11 | Onboarding + test sender + quickstarts | **Verified** (code) | Checklist; held/override/split named via starter pack; Postman + quickstart artifacts |
| 12 | Stranger test | **Verified** (automated) | `pnpm launch:stranger` — held scenario + API approve + Chromium through get-started/approvals/cases with screenshots + video (`_raw/stranger-browser-latest.json`). Human walk still founder |

## Gate 2 (code-only, this PR)

| Item | Status |
|------|--------|
| Record-only default for new workflows | **Done** (018). Sandbox pack workflows stay **enforce** so holds pause for a person |
| “Decided by” on cases / traces | **Done** |
| Feeds admin upload screen | **Done** |
| Realistic bank rules | **Done** (`demo.banking` v6 + override/alter/split rules) |

## Enforce vs record-only (sandboxes)

- **Record-only:** evaluate + seal “would have held/stopped”; do **not** block or queue for approval. Default for **new** workflows you create (migration 018).
- **Enforce (decision mode):** holds and stops actually pause work for a person. The sandbox **starter pack** installs `retail_loan` / `payment_transfer` with `record_only: false` so the named test scenarios (held, override, split, altered) behave as labeled.
- Demo Bank pack is the same: decision mode on purpose.

## Founder manual steps (exact)

1. Apply migrations 017–019: `MIGRATION_DATABASE_URL=… pnpm db:migrate`.
2. Staging stack + `pnpm launch:release-staging`.
3. `REQUIRE_MANAGED_KEY=true` only after `pnpm smoke:kms`.
4. Set `OPS_METRICS_TOKEN` (scrapers must send Bearer / X-Ops-Token).
5. `ALERT_WEBHOOK_URL` (+ optional `ALERT_5XX_SPIKE_THRESHOLD`) to a phone channel.
6. Resend with `AEGIS_EMAIL_ENABLED=1` when you mean to send.
7. `pnpm launch:restore-check` with Neon PITR.
8. Optional human stranger: `docs/launch/_raw/stranger-human-YYYYMMDD.md`.
9. Legal review of sandbox terms / synthetic banner.
10. DNS + TLS for staging; lawyer / DPA for first design partner.
11. Merge or cherry-pick g3-kms unique commits onto main after reading `_raw/g3-kms-vs-main.json`.

## Not in this pass (by design)

SSO, self-hosted package, WebAuthn, load test, public status page, website, pricing, trust-model lawyer note.
