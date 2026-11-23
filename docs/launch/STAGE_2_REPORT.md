# Stage 2 report — sandbox tenant type

| Item | Status |
|------|--------|
| Migration `016_sandbox_tenant` | **Done** |
| `tenant_kind` + immutability helpers | **Done** |
| Synthetic ingest guard | **Done** (wired on source-events) |
| Expiry lifecycle helpers | **Done** (worker email send **not live** — needs Resend job schedule) |
| Ops list / extend / suspend | **Done** (`/sandboxes`) |
| Reset my sandbox | **Done** (console route; wipe depends on DB function) |
| Wipe tests extended for sandbox | **Partly** — helpers tested in tenant-isolation; full DB wipe case needs migrate 016 applied |

## Honesty

Expiry reminder emails and archive job scheduling: **not done** as a running worker in this PR — code paths exist for listing due actions.
