# Pre-forensic-demo baseline

Tagged at `pre-forensic-demo` on branch point before the forensic / bank pilot workstream.

## Purpose

Protect existing policy evaluation behaviour. The bank adapter may opt into `combine: "all_matching"`. Policies without that setting must keep today's first/top-priority behaviour.

## Contents

| File | Description |
|------|-------------|
| `evaluate-rules.golden.json` | Golden cases for `evaluateRules` |
| `aegis-api-unit-results.json` | Vitest JSON report for unit tests (excluding `*.integration.test.ts`) when captured |

## How to re-check

```powershell
pnpm --filter aegis-api exec vitest run test/evaluate-rules.test.ts
pnpm --filter aegis-api exec vitest run --exclude "**/*.integration.test.ts"
```

Do not edit or delete existing tests under `services/aegis-api/test/`. Add new tests alongside.
