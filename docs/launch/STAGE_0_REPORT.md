# Stage 0 report — R1 evidence first (Gate 1 round 2)

**Branch:** `feature/launch-gate-0-1` @ `f3dbfe0` (plus uncommitted R1 artifacts until committed)  
**Date:** 2026-11-23  
**Rule:** Nothing marked verified without raw output under `docs/launch/_raw/`.

## 1. Suites

| Check | Result | Evidence |
|-------|--------|----------|
| `pnpm test` (all packages) | **Failed** — aegis-api 5 failed / 651 passed among other package failures | `r1-pnpm-test.txt`, `r1-pnpm-test-summary.txt` |
| `tenant-isolation.test.ts` | **Passed** — 46/46 | `r1-tenant-isolation.txt` |
| `pnpm test:redteam` | **Failed / Partial** — bank-sim 19/21; redteam-suite 10/10; live stack down | `r1-redteam.txt`, `r1-redteam-summary.txt` |
| Red Team on **redteam-lab** tenant | **Not done** — simulator/API not up for live attacks | See founder next in summary |
| `pnpm demo:runbook-walk` | **Failed** — console/API down; simulator needs pass | `r1-demo-runbook-walk.txt`, `r1-demo-runbook-walk-summary.txt` |

### `pnpm test` counts (from log)

- aegis-api: **3 failed files / 108 passed** files; **5 failed / 651 passed** tests (656 total)
- Failed packages listed by Nx: `@salanor/bank-simulator`, `aegis-ledger-sdk`, `id`, `insurance-api`, `web`, `aegis-sdk-py`, `aegis-api`
- Notable aegis-api failures: `id.integration`, `platform.integration`, `receipt-custody-timestamp`, `source-envelope` (50 parallel), `tenant-wipe-coverage` (016 tables `sandbox_access_request` / `platform_sandbox_audit` not yet in wipe allowlist heuristics)

## 2. Migrations 001–016

| Target | Result | Evidence |
|--------|--------|----------|
| Empty DB `aegis_r1_empty` | **Live** — Applied 001…016 | `stage0-migrate-empty.txt` |
| Demo-shaped copy `aegis_r1_demo` (TEMPLATE `aegis`) | **Live** — skip 001…016 already applied | `stage0-migrate-existing.txt` |

Hand-written one-line `stage0-migrate-existing.txt` was replaced with real migrate-cli output.

## 3. Deduplicated `_raw/`

Removed duplicate quickstart/stranger stamp files that matched `*-latest.json`. Kept single latest artifacts + migration/suite logs listed above.

## 4. Provenance branch containment

Evidence: `r1-provenance-ancestors.txt`

| Branch | Tip SHA | `git merge-base --is-ancestor <tip> origin/main` |
|--------|---------|--------------------------------------------------|
| `feature/provenance` | `6850ce1717397893d6e26f52ec461f084fb3c22b` | **exit 0 — YES** (fully contained) |
| `fix/provenance-followup` | `9b7f7e8fb2a3b605f012edb484c073df1de0defe` | **exit 0 — YES** (fully contained) |
| `feature/provenance-g3-kms` | `32fd82caaa1ff7bf189f07cba0d7a70f88343e37` | **exit 1 — NO** |

`origin/main` = `ce820d2765e60692d1b2e5b0ff293d6af06b8cc2`.

**Honest note:** `feature/provenance-g3-kms` still has **9 commits** and a non-empty `git diff --stat origin/main...feature/provenance-g3-kms` (Ops demo-tenants, bank-simulator UI, Dockerfiles, `platform.ts`, etc.). It is **not** fully contained by SHA. Remote `origin/feature/provenance` and `origin/fix/provenance-followup` are absent (deleted after merge); local tips remain ancestors of main.

## 5. DEMO_RUNBOOK v2

**Not done.** The Round 2 prompt said the founder would paste v2 text with the prompt; **no v2 body was included**. `docs/DEMO_RUNBOOK.md` and `demo:runbook-walk` were left unchanged. Paste the v2 text and say go to finish R1.5.

## Status table

| Item | Status |
|------|--------|
| Full `pnpm test` | **Run — failed** (raw log saved) |
| `tenant-isolation.test.ts` | **Verified** (46 pass) |
| Red Team suite (unit) | **Partly** (api suite pass; bank-sim 2 fail; live Partial) |
| Red Team on redteam-lab | **Not done** (stack) |
| `demo:runbook-walk` | **Not done** (stack) |
| Empty DB migrate 001–016 | **Verified** |
| Demo-copy migrate | **Verified** |
| Deduped `_raw/` | **Done** |
| Provenance ancestry proof | **Done** (2 YES, g3-kms NO — logged) |
| DEMO_RUNBOOK v2 | **Not done** (text missing) |

---

**Stopped here per Round 2 rules.** Waiting for founder **go** before R2 (real tenant isolation).  
If go includes DEMO_RUNBOOK v2 text, paste it in the next message.
