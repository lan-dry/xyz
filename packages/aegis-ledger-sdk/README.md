# @salanor/aegis-ledger-sdk

P0 local Aegis slice: append-only NDJSON ledger, APS-1 `0.1` validation, hash chain verify, Tier-A replay.

```typescript
import { aegis } from "@salanor/aegis-ledger-sdk";

const storePath = "./.aegis/events.ndjson";

aegis.record(storePath, {
  actor: { id: "agent:demo", type: "software_agent" },
  action: "decision.record",
  subject: { type: "workflow_step", id: "step-1" },
  context: {
    inputs: { amount: 100 },
    outcome: { decision: "approve" },
  },
});

console.log(aegis.verify(storePath));
console.log(aegis.replay(storePath));
```

Cloud ingest (P2):

```typescript
`recordCloud` posts to `/api/aegis/ingest`. When **`NATS_URL`** is set (P3 bus mode), the API validates and publishes to JetStream; the **ledger worker** persists to Postgres. Use `AEGIS_INGEST_MODE=direct` for P2 sync Postgres writes without NATS.

```ts
await aegis.recordCloud(
  { actor: { id: "agent:demo", type: "software_agent" }, /* ... */ },
  { baseUrl: "http://localhost:3000", apiKey: process.env.AEGIS_INGEST_DEV_KEY! },
);
```

From repo root: `pnpm aegis:demo`, `pnpm aegis:ingest-demo`, `pnpm aegis:test`, `pnpm aegis:bench`.
