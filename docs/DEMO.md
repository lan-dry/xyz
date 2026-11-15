# Forensic / bank demo operations

Branch: `forensic-demo-readiness`  
**Do not run reset or demo clock against production databases.**

## Guards

- `AEGIS_DEMO_MODE=true` required for demo clock and `reset`
- Database URL matching `prod|production|salanor.com` is refused unless `AEGIS_ALLOW_DEMO_ON_NAMED_DB=true`
- Receipts created while the demo clock is active carry `flags.demo_clock = true`

## Commands (current)

```powershell
# Unit-level demo spine (scenarios 1,2,3,6,7,12)
pnpm scenario:run -- all

# Offline receipt verifier
pnpm aegis-verify -- path\to\bundle.json --keys path\to\keys.json

# Policy golden baseline (must stay green)
pnpm --filter aegis-api exec vitest run test/evaluate-rules.golden.test.ts

# Bank / forensic unit tests
pnpm --filter aegis-api exec vitest run test/bank-evaluate.test.ts test/forensic-receipt.test.ts test/bank-approvals-guard.test.ts test/bank-batch-import.test.ts
```

## Not yet complete (honest)

- Full `scenario run all` from a clean DB `reset` with seeded bank users
- Scenarios 4,5,8,9,10,11 end-to-end against live API
- APS-1 seal of every bank decision (provisional event hash citation exists)
- Console wiring of bank role ladder on every approval click (in progress)

See `docs/GAP_REPORT.md`.
