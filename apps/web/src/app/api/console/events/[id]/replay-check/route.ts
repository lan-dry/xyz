import { NextResponse } from "next/server";
import type { ApsEvent } from "@salanor/aegis-ledger-sdk";

import { evaluatePolicyForReplay } from "@/lib/aegis/ingest-policy";
import { withConsoleOrg } from "@/lib/console/api-route";
import { requireConsoleContextApi } from "@/lib/console/session";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

function isReplayableEvent(value: unknown): value is ApsEvent {
  return Boolean(
    value &&
      typeof value === "object" &&
      "event_id" in value &&
      typeof (value as { event_id?: unknown }).event_id === "string",
  );
}

export async function POST(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const ctx = await requireConsoleContextApi();
  return withConsoleOrg(ctx.activeOrgId, "viewer", async (scoped) => {
    const row = await prisma.aegisIngestEvent.findFirst({
      where: {
        id,
        organizationId: scoped.activeOrgId,
      },
      select: {
        id: true,
        traceId: true,
        payload: true,
      },
    });
    if (!row) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (!isReplayableEvent(row.payload)) {
      return NextResponse.json({ error: "Stored event payload is not replayable" }, { status: 400 });
    }

    const replayPolicy = await evaluatePolicyForReplay({
      organizationId: scoped.activeOrgId,
      traceId: row.traceId,
      event: row.payload,
    });

    return NextResponse.json({
      eventRowId: row.id,
      eventId: row.payload.event_id,
      traceId: row.traceId,
      replayPolicy,
    });
  });
}
