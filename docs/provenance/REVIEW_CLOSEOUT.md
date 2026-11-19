# Review close-out (Stages 1–9 honesty pass) — Round 3 + follow-up

Branch `feature/provenance` (Round 3 freeze). Follow-up work lives on `fix/provenance-followup` (no new features).

## Round 3 live proof

1. **Red Team positive controls** — unaltered control → one change → assert specific codes; print control/expected/actual. Raw: `docs/provenance/_raw/redteam_round3.txt`.
2. **Sequence ownership** — `src_los_redteam` for Red Team; Connector re-reads last-seq on `seq_replay`; two-instance test; HA options in `INTEGRATION.md`.
3. **Flake loop** — `source-envelope` + `require-signed-events` (+ 50-parallel) × 25: **25/25 PASS**. Raw: `docs/provenance/_raw/flake_loop_25.txt`.
4. **demo:fresh** rewrites `.demo-tenant-local-stack.local.json` (ingest + personas + org marker). **demo:runbook-walk** PASS on fresh tenant. G1→G2 screenshots under `docs/TEST_PACK/provenance/`.
5. **gitleaks** — exact path allowlists. Full-history findings: **7** remaining, all `.env_deploy` (rotate). Redacted: `docs/provenance/_raw/gitleaks_full_history_redacted.txt`.
6. **Final suite** — `docs/provenance/_raw/final_suite.txt` (OVERALL PASS).

## Flake (what it was / what fixed it)

The intermittent failures in `source-envelope` / `require-signed-events` / parallel bank-event paths came from `upsertBankCase` always issuing `SAVEPOINT` even when the caller used a pool connection outside an open transaction — Postgres then errored with “SAVEPOINT can only be used in transaction blocks”, which aborted or flaked under concurrent ingest and bank-case upserts. The fix is to call `txid_current_if_assigned()` and only use SAVEPOINT when already inside a transaction; outside a transaction a failed INSERT is caught normally without aborting a txn. After that change the 25× loop was **25/25 PASS**.

## Follow-up honesty notes

- Red Team summary must print `live-proven N, not verified live N, simulated N` (never a single pass count).
- Stage 6 remains **Partial** without native `wal_level=logical` CDC; #11 can still live-prove via ingesting a collector observation + reconcile.
- Confirm mismatch API code is `params_mismatch` (sealed exception kind `execution_mismatch`).
- Hosted deploy order: `docs/DEPLOY_PROVENANCE.md`.
