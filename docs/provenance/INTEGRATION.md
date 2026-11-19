# Sending signed events to Aegis

How a core banking, LOS, or other source system sends **source-signed** events (grade G1)
into Aegis. After a decision, executors confirm against a decision token — see
[EXECUTOR.md](./EXECUTOR.md). Grades and honest limits: [PROVENANCE.md](../PROVENANCE.md),
[ASSURANCE_LADDER.md](./ASSURANCE_LADDER.md).

Pick the lowest-effort option that fits the source system. All three produce the same AEGIS-SRC1
envelope (see [SIGNING.md](./SIGNING.md)) and reach the same endpoint, so Aegis treats them identically.

| | **Connector** | **SDK** | **Raw API** |
| --- | --- | --- | --- |
| Package | `@salanor/aegis-connector` | `@salanor/aegis-sdk` | none (any language) |
| What you write | Nothing. POST plain events to a local HTTP service. | A few lines of TypeScript/Node. | Canonical JSON, SHA-256, Ed25519, HTTP client. |
| Who signs | The connector, with a key file on its host. | Your code, with a key you load. | Your code. |
| Sequence numbers (`seq`) | Assigned for you, never reused, survives crashes. | **You** assign and persist them. | **You** assign and persist them. |
| Retries and offline queue | Durable on-disk outbox, ordered delivery, exponential backoff. | **You** (`sendEvent` reports `retryable`). | **You**. |
| Idempotency | Same envelope and key on every retry. | Reuse the envelope's `idempotency_key` on retry. | Same. |
| Clock | Reports skew in `/health`. | Your host clock must be within 5 minutes (configurable by Aegis). | Same. |
| Best for | Legacy systems that can only call a local URL. Banks and insurers. | New Node/TypeScript services. | Other languages, or when you must keep full control. Use `tools/independent-verify` and `conformance/vectors.json` to check your implementation. |

## Before any of them: register the source

An admin registers the system once, with its **public** key (Console, **Sources**, or the API below). The
private key stays on the sending system.

```
# 1. Generate a key pair (Connector example; the SDK has generateKeyPair())
node packages/aegis-connector/dist/cli.js keygen --out ./keys/src_los.key
#    prints the public key (standard base64)

# 2. Register it (admin session)
POST /v1/console/sources
{ "source_id": "src_los", "name": "Loan origination", "kind": "application",
  "owner_contact": "payments-ops@example.com",
  "key_id": "k_los_2026_01", "public_key_b64": "<public key>" }
# kind: application | executor | collector | third_party
# valid_from (optional, ISO-8601) defaults to now
```

Key rotation: `POST /v1/console/sources/:sourceId/keys` with a new `key_id` and `public_key_b64`. By default
the currently active key stops being accepted immediately, so deploy the new key to the sender first (or pass
`"retire_previous": false` and revoke the old key yourself). A key with a future `valid_from` does not retire
anything until you do. Compromise: `POST /v1/console/sources/:sourceId/keys/:keyId/revoke` with `{ "reason": "..." }`.

## Ingest key

Every request carries an ingest key: `Authorization: Bearer <ingest key>` (Console, **API keys**). The ingest
key says *which organisation*; the source key says *which system and that the event is untouched*.

## Connector

```
pnpm --filter @salanor/aegis-sdk build && pnpm --filter @salanor/aegis-connector build
AEGIS_INGEST_BEARER=<ingest key> node packages/aegis-connector/dist/cli.js start --config ./aegis-connector.config.json
curl -X POST http://127.0.0.1:8787/events -H 'Content-Type: application/json' -d '{ ...decision request... }'
```

`ingest_path` defaults to `/v1/aegis/source-events`. See `packages/aegis-connector/README.md`.

### Demo Bank (local)

`pnpm pilot:provision-demo-tenant` (or `pnpm demo:fresh`) registers `src_los` / `src_core` /
`src_pay` and writes private keys + config under `.data/connectors/` (gitignored). Then:

```
pnpm demo:connectors   # LOS :8787, Core :8788, Pay :8789 (needs AEGIS_INGEST_KEY)
pnpm bank:up           # bank-simulator embeds in-process Connectors; stories are signed
```

`pnpm pilot:seed-history` also submits through the LOS Connector. Do not commit `.data/`.

### Sequence ownership (one source key → one owner)

Red Team and other scratch senders must use their **own** `source_id` (e.g.
`src_los_redteam`), never the production LOS id (`src_los`). Sharing a source id
across processes without HA discipline causes `seq_replay`.

**One registered `source_id` / signing key has a single sequence owner.** Aegis accepts
strictly increasing `seq` values per source; a second process that reuses the same
`source_id` with its own `last_seq` will get **409** `seq_replay`.

The Connector recovers by calling `GET /v1/aegis/sources/:sourceId/last-seq` (ingest
bearer), advancing local `last_seq` to the remote value, and dropping conflicting
outbox envelopes so the **next** envelope uses `last+1` — never reusing a number. If
local `last_seq` is behind remote after the conflict, it logs a clear error that
**another instance appears to own the source**.

HA options:

1. **One active instance** per `source_id` (preferred): shared `state_dir` is locked to a
   single process; run a standby that only takes over after the active instance stops.
2. **One `source_id` per instance**: give each replica its own registered source (and key)
   so sequences never collide.

Do not run two live Connectors against the same `source_id` with separate state
directories in production — the second will sync forward and drop its conflicting
outbox items; those events must be re-submitted if still needed.

## SDK

```ts
import { buildEnvelope, signEnvelope, sendEvent } from "@salanor/aegis-sdk";

const envelope = await signEnvelope(
  buildEnvelope({ source_id: "src_los", key_id: "k_los_2026_01", seq: nextSeq(), event }),
  privateKey,
);
const result = await sendEvent({
  url: "https://aegis.example.com/v1/aegis/source-events",
  bearer: process.env.AEGIS_INGEST_KEY!,
  envelope,
});
// result.ok, result.status, result.body, result.retryable
```

## Raw API

`POST /v1/aegis/source-events` (also accepted on `/v1/aegis/governed/events` and `/v1/aegis/bank/events` when
the body has `"aegis_envelope": "1"`). Body: the signed envelope. Optional header `Idempotency-Key` must equal
the envelope's `idempotency_key`.

The `event` inside is the same decision request as `/v1/aegis/governed/events` (`schema_version`, `case_id`,
`idempotency_key`, `event_type`, `emitted_at`, `attributes`, ...). Money is a decimal string, numbers are
integers.

```
200  { ...decision..., "source_signed": true, "evidence_grade": "G1" }
400  { "error": "envelope_rejected", "code": "malformed" | "unsupported_version" | "timestamp_skew", ... }
     { "error": "validation_error", ... }                (valid signature, bad decision request)
401  { "error": "envelope_rejected", "code": "bad_signature" | "event_hash_mismatch" | "unknown_key"
                                         | "key_source_mismatch" | "key_revoked" | "key_inactive"
                                         | "key_not_yet_valid" | "key_expired" }
403  { "error": "envelope_rejected", "code": "source_disabled" }
409  { "error": "envelope_rejected", "code": "seq_replay" | "nonce_reused" | "idempotency_conflict" }
```

Retry rule for senders: network errors, 408, 425, 429 and 5xx are retryable with the **identical** envelope.
A retry of an envelope Aegis already accepted returns **200** with the original response, not an error. Other
4xx (including 409) will not succeed by retrying the same bytes; fix the cause and, if the envelope was never
accepted, sign a new one.

**409 recovery (Connector).** Aegis answers a genuine duplicate with **200**, so every **409** is a real
conflict (`seq_replay`, `nonce_reused`, `idempotency_conflict`). On `seq_replay` / `idempotency_conflict`
the Connector re-reads `GET /v1/aegis/sources/:sourceId/last-seq`, advances local `last_seq`, and drops
conflicting outbox envelopes (never reuses a seq). Other 4xx stay queued and retry the identical
envelope. See [Sequence ownership](#sequence-ownership-one-source-key--one-owner).

## Organisations that require signed events

`organization.require_signed_events` is a dedicated org column (migration 006). Demo Bank sets it
explicitly on provision; turning it **off** needs two distinct admins (pending + confirm) and every
applied change is sealed as a forensic `setting_change` receipt. Sealed events record
`require_signed_events_in_force` from the org column at decision time. When the flag is on:

- Unsigned events to `/v1/aegis/governed/events` and `/v1/aegis/bank/events` get **400**
  `signed_events_required`: "This organisation only accepts signed events. Send them through the Aegis
  Connector or the @salanor/aegis-sdk (sendEvent) ...".
- Committing a batch import (`dry_run: false`) is refused for the same reason; dry runs still work.
- Signed events work as normal.

## Operational limits and settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `AEGIS_SOURCE_TS_SKEW_SEC` | `300` | Allowed difference between envelope `ts` and server time (either direction). |
| `AEGIS_SOURCE_NONCE_TTL_SEC` | `3600` | How long nonces are kept (never less than `2 * skew + 60`; older ones cannot be replayed because of the skew check). |
| `INGEST_RATE_LIMIT_PER_MIN` | `300` | Per-IP ingest limit (shared with the other ingest routes). |

Envelopes from one source are processed one at a time (per-source lock), so a very chatty single source is
bounded by decision latency; separate sources do not block each other.
