import type {
  AegisIngestStore,
  IngestPersistInput,
  IngestPersistResult,
} from "@salanor/aegis-ledger-sdk/ingest-handler";
import type { ApsEvent } from "@salanor/aegis-ledger-sdk";
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

export const prismaIngestStore: AegisIngestStore = {
  async findByIdempotencyKey(key: string): Promise<IngestPersistResult | null> {
    const row = await prisma.aegisIngestEvent.findUnique({
      where: { idempotencyKey: key },
    });
    if (!row) return null;
    return { ...toResult(row), created: false };
  },

  async create(input: IngestPersistInput): Promise<IngestPersistResult> {
    const row = await prisma.aegisIngestEvent.create({
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
