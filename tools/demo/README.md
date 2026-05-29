# Demo tools (`tools/demo`)

Scripts for local staging verification. **Stage 12** entry point:

## Full system (`full-system.mts`)

Runs the blueprint final demo (7 steps):

1. SDK proxy → policy **allow**
2. SDK proxy → policy **deny** (no outbound HTTP)
3. **Obligation** → approve → `wrapFetchResume` → trace completed
4. Signed **ingest** → witness batch → transparency log
5. **Public verifier** (witness + transparency inclusion)
6. **Compliance export** → ZIP + integrity hash
7. **SIEM** OTLP payload to mock endpoint

### Prerequisites

```bash
docker compose up -d
pnpm db:migrate && pnpm db:seed
pnpm --filter aegis-api dev    # keep running in another terminal
```

Ensure `.env` / `.env.local` has `DATABASE_URL`, `AEGIS_INGEST_DEV_KEY`, `DEV_SIGNING_PRIVATE_KEY_B64`.

### Run

```bash
pnpm demo:full-system
```

Exit code `0` when all steps pass; JSON summary printed at the end.

### Individual demos

| Script | Command |
| ------ | ------- |
| Ingest one event | `pnpm demo:ingest` |
| Proxy allow/deny | `pnpm demo:proxy` |
| Verify hash chain | `pnpm demo:verify-chain` |
| Witness inclusion | `pnpm demo:verify-inclusion <event_id>` |
| Public verifier | `pnpm verifier:public -- --org dev-org --event <id>` |
