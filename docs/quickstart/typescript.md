# Quickstart — TypeScript SDK

```bash
pnpm add @salanor/aegis-sdk
```

```ts
import {
  buildEnvelope,
  generateKeyPair,
  signEnvelope,
} from "@salanor/aegis-sdk";

const api = process.env.AEGIS_API_BASE!;
const ingest = process.env.AEGIS_INGEST_KEY!;
// Register publicKeyB64 under Sources in the console (sandbox key id).
const { privateKey, publicKeyB64 } = await generateKeyPair();
console.log("Register this public key:", publicKeyB64);

const event = {
  schema_version: 1,
  case_id: "SBX-TS-001",
  idempotency_key: crypto.randomUUID(),
  event_type: "loan_decision",
  product: "retail_loan",
  emitted_at: new Date().toISOString(),
  actor: { type: "system", id: "ts-quickstart" },
  attributes: {
    amount: 1_200_000,
    currency: "RWF",
    beneficiary_account: "ACCT-DEMO-001",
  },
  trace_id: `tr_ts_${Date.now()}`,
};

const unsigned = buildEnvelope({
  source_id: "src_los",
  key_id: "k_sandbox_los",
  seq: 1,
  event,
});
const envelope = await signEnvelope(unsigned, privateKey);

const res = await fetch(`${api}/v1/aegis/source-events`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${ingest}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(envelope),
});
console.log(await res.json());
```

Then download a bundle from the case and run `pnpm aegis-verify <bundle.json>`.
