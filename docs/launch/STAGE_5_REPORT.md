# Stage 5 report — quickstarts

| Item | Status |
|------|--------|
| curl / TS / Python / Connector docs | **Done** under `docs/quickstart/` |
| OpenAPI stub | **Done** (`openapi-public.yaml`) |
| CI job per quickstart with fresh sandbox | **Live** — `pnpm launch:quickstarts` in quality-gate |
| Evidence | `docs/launch/_raw/quickstart-run-latest.json` |

## Notes

- Runner creates a fresh `tenant_kind=sandbox` org, mint ingest key, register `src_los` / `k_sandbox_los`.
- curl + python: unsigned `/v1/aegis/bank/events`. typescript: signed `/v1/aegis/source-events` via `@salanor/aegis-sdk`.
- connector-docker: doc contract (image ref + env) — image pull is release-pack specific.
- Local Windows without `python3` uses a Node HTTP fallback for the same bank/events contract; CI requires `python3`.
