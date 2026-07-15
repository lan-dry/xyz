import { NextResponse } from "next/server";

import { withConsoleOrg } from "@/lib/console/api-route";
import { listOrgEvents } from "@/lib/console/events";
import { requireConsoleContextApi } from "@/lib/console/session";

export async function GET() {
  const ctx = await requireConsoleContextApi();
  return withConsoleOrg(ctx.activeOrgId, "viewer", async (scoped) => {
    const events = await listOrgEvents(scoped.activeOrgId, 100);
    return NextResponse.json({
      organizationId: scoped.activeOrgId,
      events: events.map((e) => ({
        rowId: e.rowId,
        receivedAt: e.receivedAt.toISOString(),
        eventId: e.eventId,
        traceId: e.traceId,
      })),
    });
  });
}
