# @salanor/attest-sdk-ts

P0 local Attest slice: append-only NDJSON ledger, APS-1 `0.1` validation, hash chain verify, Tier-A replay.

```typescript
import { attest } from "@salanor/attest-sdk-ts";

const storePath = "./.attest/events.ndjson";

attest.record(storePath, {
  actor: { id: "agent:demo", type: "software_agent" },
  action: "decision.record",
  subject: { type: "workflow_step", id: "step-1" },
  context: {
    inputs: { amount: 100 },
    outcome: { decision: "approve" },
  },
});

console.log(attest.verify(storePath));
console.log(attest.replay(storePath));
```

Cloud ingest (P2):

```typescript
`recordCloud` posts to `/api/attest/ingest`. When **`NATS_URL`** is set (P3 bus mode), the API validates and publishes to JetStream; the **ledger worker** persists to Postgres. Use `ATTEST_INGEST_MODE=direct` for P2 sync Postgres writes without NATS.

```ts
await attest.recordCloud(
  { actor: { id: "agent:demo", type: "software_agent" }, /* ... */ },
  { baseUrl: "http://localhost:3000", apiKey: process.env.ATTEST_INGEST_DEV_KEY! },
);
```

From repo root: `pnpm attest:demo`, `pnpm attest:ingest-demo`, `pnpm attest:test`, `pnpm attest:bench`.
