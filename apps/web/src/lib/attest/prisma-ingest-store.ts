import type {
  AttestIngestStore,
  IngestPersistInput,
  IngestPersistResult,
} from "@salanor/attest-sdk-ts/ingest-handler";
import type { ApsEvent } from "@salanor/attest-sdk-ts";
import type { Prisma } from "@prisma/client";

import { resolveDevOrganizationId } from "@/lib/console/dev-org";
import { prisma } from "@/lib/prisma";

function toResult(row: {
  id: string;
  traceId: string;
  payload: unknown;
}): IngestPersistResult {
  const payload = row.payload as ApsEvent;
  return {
    rowId: row.id,
    eventId: payload.event_id,
    traceId: row.traceId,
    created: true,
  };
}

export const prismaIngestStore: AttestIngestStore = {
  async findByIdempotencyKey(key: string): Promise<IngestPersistResult | null> {
    const row = await prisma.attestIngestEvent.findUnique({
      where: { idempotencyKey: key },
    });
    if (!row) return null;
    return { ...toResult(row), created: false };
  },

  async create(input: IngestPersistInput): Promise<IngestPersistResult> {
    const row = await prisma.attestIngestEvent.create({
      data: {
        organizationId: resolveDevOrganizationId(),
        traceId: input.traceId,
        payload: input.payload as unknown as Prisma.InputJsonValue,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });
    return toResult(row);
  },
};
