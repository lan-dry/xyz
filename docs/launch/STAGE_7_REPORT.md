# Stage 7 report — stranger test

| Item | Status |
|------|--------|
| Playwright stranger script | **Live** — `pnpm launch:stranger` (`services/aegis-api/scripts/run-stranger-test.mts`) |
| Human script | **Done** — `docs/launch/STRANGER_TEST.md` |
| Evidence | `docs/launch/_raw/stranger-run-latest.json`, `stranger-bundle-*.json` |
| Path proven | access-request → Ops approve → admin session → checklist → bank ingest → evidence bundle → `aegis-verify` → auditor portal invite → auditor membership invite → Playwright request checklist |

## Notes

- Automated stranger is wired into quality-gate (after `playwright install chromium`).
- Human run against hosted Ops/console still recommended; mark READY_TO_SELL fully verified only with `_raw/stranger-human-YYYYMMDD.md` when a founder walks the UI.
