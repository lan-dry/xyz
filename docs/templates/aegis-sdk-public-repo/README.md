# @salanor/aegis

TypeScript SDK for **[APS-1](https://salanor.com/spec)** (Agent Provenance Standard) — sign agent events, ingest to Salanor Aegis, and optionally wrap `fetch` with policy gates.

## Install

```bash
npm install @salanor/aegis
# or
pnpm add @salanor/aegis
```

## Quickstart

Prerequisites: an Aegis ingest API key and an Ed25519 key pair registered for your agent (`did:agent` binding is documented at [salanor.com/spec](https://salanor.com/spec)).

```typescript
import { signEvent, signAndIngest, type ApsEvent } from "@salanor/aegis";
import { randomUUID } from "node:crypto";

const organizationId = process.env.AEGIS_ORG_ID!;
const agentId = process.env.AEGIS_AGENT_ID!;
const keyId = process.env.AEGIS_KEY_ID!;
const privateKeyB64 = process.env.AEGIS_SIGNING_PRIVATE_KEY_B64!;
const ingestUrl = process.env.AEGIS_INGEST_URL ?? "https://api.aegis.salanor.com/v1/aegis/events";
const ingestBearer = process.env.AEGIS_INGEST_API_KEY!;

const event: ApsEvent = {
  schema_version: 1,
  event_id: `evt_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
  organization_id: organizationId,
  trace_id: `trc_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
  agent_id: agentId,
  key_id: keyId,
  emitted_at: new Date().toISOString(),
  actor_type: "agent",
  actor_principal: "quickstart",
  action_kind: "tool_call",
  policy_decision: "allow",
  payload: { tool: "example.ping", ok: true },
};

// Option A — sign + POST in one call
const result = await signAndIngest(event, ingestUrl, {
  privateKeyB64,
  keyId,
  bearer: ingestBearer,
});
console.log("ingested", result.eventId);

// Option B — sign only (bring your own transport)
const signed = await signEvent(event, { privateKeyB64, keyId });
```

Local development against `aegis-api`:

```bash
export AEGIS_INGEST_URL=http://127.0.0.1:8080/v1/aegis/events
export AEGIS_INGEST_API_KEY=aegis_dev_local_change_me
```

## Specification

- **APS-1** event envelope: [salanor.com/spec](https://salanor.com/spec)
- JSON Schema (draft): [github.com/salanor/aegis-sdk](https://github.com/salanor/aegis-sdk/tree/main/spec/aps-0.1.schema.json) *(adjust URL after publish)*

## License

MIT — see [LICENSE](./LICENSE).

## Related

- [Aegis product docs](https://docs.salanor.com/aegis)
- [Design partner program](https://salanor.com/contact) — topic: design partner
