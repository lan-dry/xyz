import { publishIngest } from "@salanor/aegis-bus";
import type {
  AegisIngestPublisher,
  IngestPersistInput,
  IngestPersistResult,
} from "@salanor/aegis-ledger-sdk/ingest-handler";

export function createNatsIngestPublisher(params: { organizationId: string }): AegisIngestPublisher {
  return {
    async publish(input: IngestPersistInput): Promise<IngestPersistResult> {
      await publishIngest({
        traceId: input.traceId,
        event: input.payload,
        idempotencyKey: input.idempotencyKey,
        organizationId: params.organizationId,
      });

      return {
        rowId: input.payload.event_id,
        eventId: input.payload.event_id,
        traceId: input.traceId,
        created: true,
      };
    },
  };
}

export function isBusIngestEnabled(): boolean {
  const flag = process.env.AEGIS_INGEST_MODE?.trim().toLowerCase();
  if (flag === "direct") return false;
  if (flag === "bus") return true;
  return Boolean(process.env.NATS_URL?.trim());
}
