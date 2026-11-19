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
9. **TEST_PACK screenshots** — `docs/TEST_PACK/provenance/` (sources, exceptions, verify, live, provenance-panel, exports, systems, red-team). Bundle: `docs/TEST_PACK/provenance/bundles/g1-exported-bundle.json` verifies OK (aegis-verify + Python).
10. **Stage 6** — remains **Partial** (no native `wal_level=logical` Postgres on this host; Docker probe unreliable). Native Postgres attempt noted in `STAGE_6_REPORT.md`.
11. **Secrets** — `.env` / `.data/` gitignored; hosted key delivery in `HOSTED_SIGNING_KEYS.md`; gitleaks tree scan clean with allowlists for `_raw`, `TEST_PACK`, and public `key_id` regexes.
12. **Final suite** — results below; raw under `docs/provenance/_raw/final_suite.txt` and `final_suite_parts/`.

## Final suite results (2026-11-19)

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm --filter aegis-api exec vitest run` | **PASS** | Re-run: **579 passed**, 1 skipped. Earlier full-suite flake on parallel source-envelope / require-signed-events did not reproduce. |
| aegis-api `tsc --noEmit` | **PASS** | |
| web-console `tsc --noEmit` | **PASS** | |
| aegis-api `eslint .` | **PASS** | |
| web-console `eslint .` | **PASS** | |
| aegis-api `build` | **PASS** | |
| web-console `build` | **PASS** | |
| `pnpm conformance:src1` | **PASS** | |
| `gitleaks detect --no-git --config=.gitleaks.toml --source=.` | **PASS** | |
| `pnpm aegis-verify` g1 bundle | **PASS** | `docs/TEST_PACK/provenance/bundles/g1-exported-bundle.json` |
| `py -3 …/verify_bundle.py` g1 | **PASS** | |
| `pnpm demo:runbook-walk` | **FAIL** | Persona login + bank ingest key in `.demo-tenant-local-stack.local.json` do not match live DB `demo-bank` (`key_prefix=aegis_lo`). §12 Lying Red Team beats (#5, #11, honest-limit) ran **Live**. |

**OVERALL: FAIL** only on `demo:runbook-walk` / live bank story path until the Demo Bank ingest key is re-provisioned into the local tenant file. Automated unit/integration suite, builds, conformance, gitleaks, and fixture bundle verify are green.

Artifacts: `docs/provenance/_raw/final_suite.txt`, `docs/provenance/_raw/final_suite_parts/`.
