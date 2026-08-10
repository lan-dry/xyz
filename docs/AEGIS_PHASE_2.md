# Aegis Phase 2 — Cloud Ingest Bridge (Prototype)

**Phase ID:** P2  
**Objective:** Demonstrate SDK → authenticated edge → persisted durable primitive **without** full PDF surface area.

---

## Scope IN

| Area | Deliverable |
|------|-------------|
| Ingest endpoint | Stateless verify + queue append (Kafka/NATS-lite acceptable interim) |
| Durability replay test | Chaos: kill writer mid-batch → reconcile |
| Telemetry | Structured logs with `trace_id` |
| APS public stub page | `/standards` initial content publishes |

---

## Scope OUT

| Item | Deferred |
|------|----------|
| Merkle anchoring | P3 |
| Multi-region HA | Later |

---

## Acceptance criteria

1. Integration test emits event → survives simulated pod restart ≤ RPO documented.  
2. No plaintext secrets logged.  
3. Throughput modest target (≥200 evt/s sustained 5 minutes dev cluster).  

---

## Dependencies

P1 infra secrets management operational.

---

## Exit checklist (implementation status)

| # | Criterion | Status |
|---|-----------|--------|
| 1 | `aegis_ingest_events` Prisma model + `pnpm db:push` | Done |
| 2 | `POST /api/aegis/ingest` — API key auth, APS validation, `trace_id`, structured logs | Done |
| 3 | `@salanor/aegis-ledger-sdk` `aegis.recordCloud` / `remoteRecord` | Done |
| 4 | Durability test + `docs/AEGIS_P2_DURABILITY.md` (RPO ~0 sync Postgres) | Done |
| 5 | `/standards` APS-1 v0.1 summary (FR-WEB-APS-PUBLIC) | Done |
| 6 | `pnpm aegis:ingest-demo` + `.env.example` `AEGIS_INGEST_DEV_KEY` | Done |
| 7 | `pnpm aegis:test` + `pnpm build` green in CI | Verify locally |

**Deferred (P3+):** NATS/Kafka bus, Merkle anchoring, multi-region HA, ≥200 evt/s sustained load test.
