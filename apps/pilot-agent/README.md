# Pilot agent — reference client using `@salanor/aegis`

**Full walkthrough:** [docs/PILOT_WALKTHROUGH.md](../../docs/PILOT_WALKTHROUGH.md)

## Where the SDK is used

| File | SDK function | Purpose |
|------|----------------|---------|
| `src/governance.ts` | `recordTraceStart`, `recordLlmInvocation` | Signed steps with `span_id` + enriched payload |
| `src/governance.ts` | `wrapFetch` | Policy gate + payment tool call (`spanId` on context) |
| `src/scenario-support-refund.ts` | (orchestration) | Runs the demo ticket flow |

This app **is** the client integration example. Production customers embed the same SDK in **their** agent app the same way.

```bash
cp .env.example .env
# fill from console (API key) + signup/provision (org, agent, signing key)
pnpm pilot:agent   # from repo root
```

Package: `@salanor/aegis` (workspace `sdks/typescript`).
