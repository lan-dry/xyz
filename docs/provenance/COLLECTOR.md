# Independent capture / Postgres collector (Stage 6)

Aegis grades say **how data was vouched for**. G1 is the application's own signature.
G2 is corroboration from another feed. **G3** is capture that does not go through the
application path at all — a separate process, with its own credential and source key,
observing the same ledger change.

## 1. What this is

| Piece | Role |
| --- | --- |
| `@salanor/aegis-collector-pg` | Separate Node process; reads Postgres **logical decoding** (pgoutput preferred) |
| Source `src_core_cdc` | Registered with `kind=collector` and its own Ed25519 key |
| `POST /v1/aegis/collector-events` | Accepts AEGIS-SRC1 envelopes; stores `collector_cdc_event` (no bank decision path) |
| Reconciliation | Links collector events to app cases → G3, or raises `db_change_without_event` |

The collector **must not** use the application database role. Use a dedicated replication
/ read role and a dedicated ingest bearer.

## 2. Event shape

Each change becomes a source-signed business event:

```json
{
  "schema_version": 1,
  "event_type": "cdc.row_change",
  "case_id": "LN-…",
  "idempotency_key": "…uuid…",
  "emitted_at": "2026-11-19T00:00:00.000Z",
  "attributes": {
    "cdc": {
      "schema": "public",
      "table": "ledger_entry",
      "operation": "update",
      "row_key": { "case_id": "LN-…" },
      "new_values_hash": "<sha256 hex of JCS(new_values)>",
      "lsn": "0/16B3748"
    }
  }
}
```

`case_id` is resolved from `row_key` via config `case_id_mappings` (e.g. column
`case_id` on table `ledger_entry`).

## 3. Postgres prerequisites (pgoutput)

Logical decoding needs:

- `wal_level = logical`
- `max_replication_slots >= 1`
- `max_wal_senders >= 1`
- A publication over the watched tables
- A replication slot (`pgoutput`)

### Demo container (`aegis-pg-demo`)

As of Stage 6 work, the local demo Postgres on `:5435` was probed at
**`wal_level=replica`**. Logical decoding is therefore **not** finished/tested against
that container in this stage.

To enable logical decoding for a future Done claim:

```bash
docker compose -f deploy/docker/docker-compose.postgres-demo.yml \
  -f deploy/docker/docker-compose.postgres-demo.logical.yml up -d
```

Then:

```bash
pnpm --filter @salanor/aegis-collector-pg exec node -e "…"  # or: aegis-collector-pg check
```

**Do not** substitute table triggers (or LISTEN/NOTIFY) and call the result G3. Triggers
run inside the same database session as the writer; they are not independent capture.

## 4. Reconciliation rules

On each reconciliation run (`runReconciliation`):

1. Load `collector_cdc_event` rows in the period.
2. If there is a sealed app receipt for the same `case_id` → mark matched and
   `recordGradeChange` to **G3** (`independently_captured`), reason:
   `independently captured by src_core_cdc (LSN …) on <time>`.
3. If the collector saw a change and there is **no** matching app event →
   exception `db_change_without_event` ("Ledger row changed with no matching
   application event").

This is the red-team case: someone updates the ledger directly; the collector signs what
it saw; Aegis raises an exception because the application never sent an event.

## 5. Payment gateway tap / webhook capture pattern

Independent capture is not limited to Postgres. The same **G3** idea applies when a
payment gateway (or switch) signs a fact that the merchant app did not originate.

### Pattern

1. **Register a third source** (or collector) with its own key, e.g. `src_pay_gateway`,
   `kind=third_party` or `collector`.
2. **Prefer a tap the app does not control:**
   - Gateway → Aegis **webhook** signed with the gateway's HMAC/Ed25519 (Aegis verifies
     against the registered key, then seals).
   - Or a bank/switch **file drop** / SFTP feed ingested by a collector process that
     source-signs each row.
3. **Do not** have the application forward "what the gateway said" under the app's key
   and call it independent — that is still G1 (or G2 if reconciled as a feed).
4. **Match** gateway capture to the Aegis case / decision token the same way Stage 4
   matches ledger feeds: identity + amount/beneficiary; on match raise to G3 via
   `independently_captured` only when the capture path is cryptographically outside the
   app. If the gateway only posts into the app, and the app is the sole signer, stay at
   G1/G2.

### Webhook sketch

```
Payment gateway  --signed webhook-->  Aegis ingest (verify gateway key)
Application      --AEGIS-SRC1------>  Aegis ingest (app key)
Reconciliation   --match case_id-->  G3 if both present and agree
                 --else------------>  exception (missing side)
```

Store the gateway payload hash and delivery id the same way CDC stores
`new_values_hash` + LSN: an opaque, replay-safe identifier the verifier can cite.

## 6. Package commands

```bash
# Generate collector key (register public key as src_core_cdc / kind=collector)
aegis-collector-pg keygen --out ./collector.key.json

# Probe wal_level
aegis-collector-pg check --config ./aegis-collector-pg.config.json

# Run (requires wal_level=logical)
aegis-collector-pg start --config ./aegis-collector-pg.config.json
```

Example config fields: `source_id`, `key_id`, `private_key_path`, `database_url`
(`AEGIS_COLLECTOR_DATABASE_URL`), `tables[]`, `case_id_mappings[]`, `aegis_url`,
`ingest_bearer` (`AEGIS_INGEST_BEARER`), `publication`, `slot`, `state_dir`.

## 7. Status

See [STAGE_6_REPORT.md](./STAGE_6_REPORT.md). Stage status is **Partial** until
pgoutput streaming is finished and tested against Docker with `wal_level=logical`.
