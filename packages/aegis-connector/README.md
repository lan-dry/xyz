# @salanor/aegis-connector

Small local Node HTTP service that sits next to a source system (LOS, core banking, ...).
It signs business events into AEGIS-SRC1 envelopes (`@salanor/aegis-sdk`), persists them in a
crash-safe outbox, and forwards them to Aegis with retries.

## Run

```
pnpm --filter @salanor/aegis-sdk build
pnpm --filter @salanor/aegis-connector build

# 1. generate a key (private key -> file with mode 0600, public key printed)
AEGIS_KEY_PASSPHRASE=...   # optional: encrypts the key file (scrypt + AES-256-GCM)
node packages/aegis-connector/dist/cli.js keygen --out ./keys/src_los.key

# 2. configure (see aegis-connector.config.example.json) and start
AEGIS_INGEST_BEARER=... node packages/aegis-connector/dist/cli.js start --config ./aegis-connector.config.json
```

Register the printed public key with Aegis for your `source_id` / `key_id`.

## HTTP API (default `127.0.0.1:8787`)

| Route | Behaviour |
| --- | --- |
| `POST /events` | Body = business event (JSON object; money as decimal strings, integers only). Optional `Idempotency-Key: <uuid>` header makes caller retries safe. Returns **200** `{status:"delivered", seq, idempotency_key, event_hash, receipt}` if Aegis accepted it within `sync_wait_ms`, otherwise **202** `{status:"queued", ...}`. 422 if the same key is reused with a different event. |
| `GET /health` | `{connected, outbox_size, last_seq, key_id, source_id, public_key_b64, clock_skew_ms, last_success_at, last_error}`. `connected` = last delivery attempt succeeded. `clock_skew_ms` = Aegis `Date` header minus local clock (1 s resolution). |
| `POST /execute/confirm` | Forwards to Aegis `POST /v1/aegis/executions/confirm`. When `params` is present and `source_envelope` is not, the Connector source-signs the params (AEGIS-SRC1) so the executor claim is attributable. |

If `local_auth_token` (or `AEGIS_CONNECTOR_LOCAL_TOKEN`) is set, `POST` routes require `Authorization: Bearer <token>`.

## Delivery guarantees

State lives in `state_dir` (one connector process per directory, enforced with a lock file):

- `outbox/<seq>.json` - signed envelope, created atomically (temp file + fsync + rename) and never rewritten.
- `state.json` - `last_seq`; on startup `last_seq = max(state.json, outbox/, delivered.jsonl)`, so a crash between
  writing the outbox file and `state.json` can never lead to a reused seq.
- `delivered.jsonl` - fsync'd ack log (receipts). An outbox file whose idempotency key is already acked is dropped on startup.

Rules: a seq is assigned, signed and persisted **before** anything is sent; seq is never reused; the outbox
is delivered one envelope at a time in seq order; an envelope is removed only after Aegis answers 2xx
(idempotent duplicates also return 200 with the stored response; 409 is a conflict and stays queued);
every retry sends the identical envelope with the same idempotency key (`Idempotency-Key` header).
Rejected requests (bad JSON, floats, ...) do not consume a seq.

Failures (network, 5xx, 4xx such as a bad bearer) keep the envelope queued and retry with exponential backoff
(`retry.initial_ms`, `max_ms`, `factor`, `jitter`). A permanently rejected head blocks later seqs (order is
preserved) and is visible as `last_error` plus a growing `outbox_size` in `/health`.

## Config

See `aegis-connector.config.example.json`. Environment overrides: `AEGIS_INGEST_BEARER`, `AEGIS_KEY_PASSPHRASE`,
`AEGIS_CONNECTOR_LOCAL_TOKEN`, `AEGIS_CONNECTOR_CONFIG`. Relative paths resolve against the config file.
`ingest_path` defaults to `/v1/aegis/source-events` (provisional until the Aegis ingest route is defined).

Key files: on POSIX the connector refuses to load a key readable by group/others. Windows does not enforce POSIX
modes; use NTFS ACLs there.

## Tests

```
pnpm --filter @salanor/aegis-connector test
```
