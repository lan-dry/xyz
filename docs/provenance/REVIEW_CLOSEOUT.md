# Review close-out (Stages 1–9 honesty pass)

Branch `feature/provenance`. **No merge to main.**

## Items

1. **Commit Stages 3–9** — already on branch; Stage 1 close-out `b02cd92`. This review commit follows.
2. **Red Team** — panel labels Live vs Simulation; raw `docs/provenance/_raw/redteam_18.txt`. Six remain Simulated (#9–10, #14–15, #17–18).
3. **One real bank** — separate Connectors via `pnpm demo:connectors` (:8787–:8789); Core refuses without confirm; feed export live; full G1→G2 story **Partial** (LOS seq_replay under dual Connector state). Raw `docs/provenance/_raw/bank_g1_g2*.txt`.
4. **Third-party facts** — subject, `issued_at` window, `request_id`, replay; tests in `third-party-facts.test.ts` (pass).
5. **Approver binding** — `step_up_mfa` as `{claimed_by_client:true}` only; omitted view hash → `server-rendered, not confirmed by approver`; per-vote bindings; tests pass.
6. **Migration 012** — text in `docs/provenance/_raw_migration_012.txt`; `migration-012-wipe-guards.test.ts` proves non-demo refuse + audit.
7. **Permit vs token** — `docs/provenance/PERMIT_AND_TOKEN.md`; EXECUTOR.md points here.
8. **Trusted-time** — Stage 2–5 reports corrected (not “pre-existing on main”).
9. **TEST_PACK screenshots** — `docs/TEST_PACK/provenance/` (sources, exceptions, verify, live, provenance-panel, exports, systems, red-team). Bundle archive/verify still to paste from demo export when a clean G1 case exists.
10. **Stage 6** — remains **Partial** (no native `wal_level=logical` Postgres on this host; Docker probe unreliable).
11. **Secrets** — `.env` / `.data/` gitignored; hosted key delivery in `HOSTED_SIGNING_KEYS.md`; gitleaks run on review commit.
12. **Final suite** — run from committed tree after this commit (lint/typecheck/builds/conformance/gitleaks/`demo:runbook-walk` with Lying segment automated against Red Team).
