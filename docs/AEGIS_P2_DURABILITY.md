# Aegis P2 — Durability & RPO (prototype)

**Phase:** P2 cloud ingest bridge  
**Storage:** Synchronous `INSERT` into Postgres (`aegis_ingest_events`)

## Recovery point objective (RPO)

For this prototype, each accepted ingest request is committed with a single Prisma `create` against Postgres before the HTTP `201` response is returned. There is no intermediate queue (NATS/Kafka deferred to **P3**).

| Failure mode | Prototype behavior | Effective RPO |
|--------------|-------------------|---------------|
| Process crash after DB commit | Event already durable | ~0 (committed) |
| Process crash before DB commit | Client receives 5xx or connection drop; client may retry with same `Idempotency-Key` | At-most-once per key when retried |
| Postgres unavailable | `500` — no ack | Unbounded until DB returns |

**Documented RPO for P2:** ~**0** for acknowledged writes (sync Postgres). Not HA/multi-region.

## Replay / reconcile test

`packages/aegis-ledger-sdk/src/ingest-handler.test.ts` simulates pod restart by:

1. Writing through `handleIngest` into an in-memory store backed by maps (same contract as Prisma adapter).
2. Cloning persisted rows into a fresh store instance (new “client” after restart).
3. Asserting the APS `event_id` is still readable.

## Future (P3+)

- Durable bus (NATS JetStream) between edge and ledger writer — see `FR-AEG-BUS-ORDER`.
- Merkle batching and anchoring — see `FR-AEG-LEDGER-MERKLE`, `FR-AEG-ANCHOR-OTS`.
- Sustained ≥200 evt/s load test on dev cluster — optional micro-bench stub; not a P2 gate.
