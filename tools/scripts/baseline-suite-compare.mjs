#!/usr/bin/env node
/**
 * Checklist runner notes for baseline-vs-branch suite comparison (T2.1).
 * Full worktree compare needs Docker ports and the pre-forensic-demo tag.
 *
 * Usage (document results into docs/FINAL_REPORT.md):
 *   node tools/scripts/baseline-suite-compare.mjs
 */
console.log(`
T2.1 Baseline vs branch — run manually:

1) Baseline worktree
   git worktree add ../salanor-baseline pre-forensic-demo
   docker run -d --name aegis-pg-base -e POSTGRES_PASSWORD=salanor -e POSTGRES_USER=salanor -e POSTGRES_DB=aegis -p 5450:5432 postgres:16-alpine
   DATABASE_URL=postgresql://salanor:salanor@127.0.0.1:5450/aegis pnpm --filter aegis-ledger-sdk test
   DATABASE_URL=... pnpm --filter id test
   DATABASE_URL=... pnpm --filter insurance-api test

2) Branch (this tree) on a fresh DB :5451 — same commands

3) Table columns: test name | baseline | branch | regression?

Any pass→fail is a code regression (fix in product code, not the test).

aegis-api fresh totals (2026-11-15 T1 gate on :5443):
  200 passed | 1 skipped | 0 failed
`);
