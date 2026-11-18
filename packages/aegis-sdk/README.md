# @salanor/aegis-sdk

AEGIS-SRC1 **source envelope** signing and verification. This is the source-system
provenance format; it is **not** APS-1 (see `@salanor/aegis` / `sdks/typescript` for that).

```json
{
  "aegis_envelope": "1",
  "source_id": "src_los",
  "key_id": "k_los_2026_01",
  "seq": 1042,
  "ts": "2026-11-18T10:01:22.123Z",
  "nonce": "<base64url, 16 random bytes>",
  "idempotency_key": "<uuid>",
  "event": {},
  "event_hash": "<sha256 hex of JCS(event)>",
  "signature": "<base64url Ed25519>"
}
```

Signature input: `SHA-256("AEGIS-SRC1\n" + source_id + "\n" + key_id + "\n" + JCS(envelope without "signature"))`,
signed with Ed25519 (RFC 8032, 32-byte digest as the message). JCS is RFC 8785 via the `canonicalize` package.

Rules enforced:

- Money is always a **decimal string** (`"1234.50"`). Numbers in events must be safe integers; floats are rejected.
- Envelopes may only contain the fields above (unknown fields are `malformed`).
- `verifyEnvelope` never throws; it returns `{ ok: true }` or `{ ok: false, reason }` where reason is
  `malformed | unsupported_version | event_hash_mismatch | bad_signature`.

```ts
import { buildEnvelope, generateKeyPair, signEnvelope, verifyEnvelope, sendEvent } from "@salanor/aegis-sdk";

const keys = await generateKeyPair();
const envelope = await signEnvelope(
  buildEnvelope({ source_id: "src_los", key_id: "k_los_2026_01", seq: 1, event: { amount: "10.00" } }),
  keys.privateKey,
);
await verifyEnvelope(envelope, keys.publicKey); // { ok: true }
await sendEvent({ url, bearer, envelope });
```

`seq` management and durable retry are the caller's job; see `@salanor/aegis-connector`.

## Tests

```
pnpm --filter @salanor/aegis-sdk test
```

Conformance vectors live in `conformance/vectors.json` at the repo root (test-only keys).
