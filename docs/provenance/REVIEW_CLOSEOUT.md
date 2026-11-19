# Review close-out (Stages 1–9 honesty pass) — Round 3

Branch `feature/provenance`. **No merge to main.** Freeze after Round 3 (no new features).

## Round 3 live proof

1. **Red Team positive controls** — unaltered control → one change → assert specific codes; print control/expected/actual. Raw: `docs/provenance/_raw/redteam_round3.txt` (OVERALL PASS).
2. **Sequence ownership** — `src_los_redteam` for Red Team; Connector re-reads last-seq on `seq_replay`; two-instance test; HA options in `INTEGRATION.md`.
3. **Flake loop** — `source-envelope` + `require-signed-events` (+ 50-parallel) × 25: **25/25 PASS**. Raw: `docs/provenance/_raw/flake_loop_25.txt`.
4. **demo:fresh** rewrites `.demo-tenant-local-stack.local.json` (ingest + personas + org marker). **demo:runbook-walk** PASS on fresh tenant. G1→G2: `bank-g1-g2.mjs` PASS; screenshots `docs/TEST_PACK/provenance/case-g1-source-signed.png`, `case-g2-after-reconcile.png`. Runbook raw: `docs/provenance/_raw/runbook_walk_round3.txt`.
5. **gitleaks** — exact path allowlists (no directory free-pass for fixtures). Full-history findings: **7** remaining, all `.env_deploy` (rotate; not allowlisted). Redacted: `docs/provenance/_raw/gitleaks_full_history_redacted.txt`.
6. **Final suite** — re-run from committed tree; see `docs/provenance/_raw/final_suite.txt`. Suite archives HEAD for gitleaks, stops :3000 before `next build`, then bounces the console before `demo:runbook-walk`.

## Honesty notes

- Stage 6 remains **Partial** (no native logical replication CDC on this host).
- Red Team #11/#13 labelled **Not verified live** when collector/reconcile does not surface the exception.
- Confirm mismatch API code is `params_mismatch` (sealed exception kind `execution_mismatch`).
