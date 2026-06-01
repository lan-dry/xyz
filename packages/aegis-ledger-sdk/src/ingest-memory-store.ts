import { randomUUID } from "node:crypto";
import type { AegisIngestStore, IngestPersistInput, IngestPersistResult } from "./ingest-handler.js";
import type { ApsEvent } from "./types.js";

/** In-memory ingest store for unit/integration tests (simulates Postgres durability). */
export function createMemoryIngestStore(): AegisIngestStore & {
  rows: Map<string, { row: IngestPersistResult; payload: ApsEvent }>;
  reset(): void;
} {
  const byIdempotency = new Map<string, IngestPersistResult>();
  const byEventId = new Map<string, { row: IngestPersistResult; payload: ApsEvent }>();

  return {
    rows: byEventId,

    reset() {
      byIdempotency.clear();
      byEventId.clear();
    },

    async findByIdempotencyKey(key: string): Promise<IngestPersistResult | null> {
      return byIdempotency.get(key) ?? null;
    },

    async create(input: IngestPersistInput): Promise<IngestPersistResult> {
      if (input.idempotencyKey) {
        const existing = byIdempotency.get(input.idempotencyKey);
        if (existing) {
          return { ...existing, created: false };
        }
      }

      const result: IngestPersistResult = {
        rowId: randomUUID(),
        eventId: input.payload.event_id,
        traceId: input.traceId,
        created: true,
      };

      if (input.idempotencyKey) {
        byIdempotency.set(input.idempotencyKey, result);
      }
      byEventId.set(input.payload.event_id, { row: result, payload: input.payload });
      return result;
    },
  };
}
