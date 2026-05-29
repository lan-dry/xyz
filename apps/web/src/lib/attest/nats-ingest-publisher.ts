import { publishIngest } from "@salanor/attest-bus";
import type {
  AttestIngestPublisher,
  IngestPersistInput,
  IngestPersistResult,
} from "@salanor/attest-sdk-ts/ingest-handler";

export function createNatsIngestPublisher(params: { organizationId: string }): AttestIngestPublisher {
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
  const flag = process.env.ATTEST_INGEST_MODE?.trim().toLowerCase();
  if (flag === "direct") return false;
  if (flag === "bus") return true;
  return Boolean(process.env.NATS_URL?.trim());
}
