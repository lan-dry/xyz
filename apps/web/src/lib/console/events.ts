import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type ConsoleEventRow = {
  rowId: string;
  receivedAt: Date;
  eventId: string;
  traceId: string;
};

function eventIdFromPayload(payload: unknown): string {
  if (payload && typeof payload === "object" && "event_id" in payload) {
    const id = (payload as { event_id: unknown }).event_id;
    if (typeof id === "string") return id;
  }
  return "unknown";
}

/** Query args for tenant-scoped listing (used in tests to assert isolation). */
export function orgEventsQueryArgs(organizationId: string, limit: number) {
  return {
    where: { organizationId },
    orderBy: { receivedAt: "desc" as const },
    take: limit,
    select: {
      id: true,
      receivedAt: true,
      traceId: true,
      payload: true,
    },
  };
}

/** Tenant-scoped event listing — always filters by organizationId. */
export async function listOrgEvents(
  organizationId: string,
  limit = 50,
): Promise<ConsoleEventRow[]> {
  const rows = await prisma.aegisIngestEvent.findMany(orgEventsQueryArgs(organizationId, limit));
  return rows.map((row) => ({
    rowId: row.id,
    receivedAt: row.receivedAt,
    traceId: row.traceId,
    eventId: eventIdFromPayload(row.payload as Prisma.JsonValue),
  }));
}

/** Cross-tenant guard for API routes — returns null when user cannot access org. */
export async function assertOrgMembershipForUser(
  identityLinkId: string,
  organizationId: string,
): Promise<boolean> {
  const row = await prisma.organizationMembership.findUnique({
    where: {
      organizationId_identityLinkId: {
        organizationId,
        identityLinkId,
      },
    },
    select: { id: true },
  });
  return row !== null;
}
