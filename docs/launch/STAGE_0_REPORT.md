# Stage 0 report — one branch, one suite

**Branch:** `feature/launch-gate-0-1` (from `origin/main` @ `ce820d2`)  
**Date:** 2026-11-23

## Merge audit

| Branch | Ahead of main | Action |
|--------|---------------|--------|
| `feature/provenance` | 0 | Already absorbed — no cherry-pick |
| `fix/provenance-followup` | 0 | Already absorbed — no cherry-pick |
| `feature/provenance-g3-kms` | messages overlap; content already on main (main is ahead on bank-sim / permit / exceptions) | No cherry-pick required |

Migrations on main already include **006–015** (prompt’s “006–012” is outdated). New work starts at **016**.

## Migrations

| Target | Result | Evidence |
|--------|--------|----------|
| Existing local / demo-shaped DB | **Live** — migrate-cli skipped 002–015 as already applied | `docs/launch/_raw/stage0-migrate-existing.txt` |
| Empty database from scratch | **Not done in this run** — no disposable empty Neon branch provisioned in-session | Founder: create scratch DB, `pnpm db:migrate`, attach log |

## Suite

| Check | Result | Notes |
|-------|--------|-------|
| `execution-permit`, `console-route-auth-matrix`, `migration-012-wipe-guards` | **Live PASS** (67 tests) | `docs/launch/_raw/stage0-focused-tests.txt` |
| Full `pnpm test` / `demo:runbook-walk` / Red Team `redteam-lab` | **Not done in this run** — deferred to CI / founder machine with full stack | Marked open |

## DEMO_RUNBOOK v2

**Not done** — founder v2 text was not supplied in the launch prompt. Current [`docs/DEMO_RUNBOOK.md`](../DEMO_RUNBOOK.md) left unchanged.

## Status table

| Item | Status |
|------|--------|
| Single launch branch | **Done and live** |
| Provenance branch merge | **Done** (already on main) |
| Migrations 006–015 on existing DB | **Done and live** |
| Empty DB migrate | **Not done** |
| Full suite + runbook-walk + redteam-lab | **Not done** (focused subset live) |
| DEMO_RUNBOOK v2 replace | **Not done** |
