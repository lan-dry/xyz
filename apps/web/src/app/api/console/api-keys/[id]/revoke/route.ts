import { NextResponse } from "next/server";

import { appendConsoleAudit } from "@/lib/console/audit";
import { withConsoleOrg } from "@/lib/console/api-route";
import { requireConsoleContextApi } from "@/lib/console/session";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const ctx = await requireConsoleContextApi();

  return withConsoleOrg(ctx.activeOrgId, "developer", async (scoped) => {
    const existing = await prisma.apiKey.findFirst({
      where: { id, organizationId: scoped.activeOrgId },
    });
    if (!existing) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 });
    }
    if (existing.revokedAt) {
      return NextResponse.json({ ok: true, revokedAt: existing.revokedAt });
    }

    const updated = await prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    await appendConsoleAudit({
      organizationId: scoped.activeOrgId,
      actorIdentityId: scoped.identityLinkId,
      action: "api_key_revoked",
      targetType: "api_key",
      targetId: id,
      metadata: { prefix: existing.prefix },
    });

    return NextResponse.json({ ok: true, revokedAt: updated.revokedAt });
  });
}
