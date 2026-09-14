import { NextResponse } from "next/server";

import { appendConsoleAudit } from "@/lib/console/audit";
import { withConsoleOrg } from "@/lib/console/api-route";
import { requireConsoleContextApi } from "@/lib/console/session";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const ctx = await requireConsoleContextApi();
  return withConsoleOrg(ctx.activeOrgId, "admin", async (scoped) => {
    const invite = await prisma.organizationInvite.findFirst({
      where: {
        id,
        organizationId: scoped.activeOrgId,
        acceptedAt: null,
        revokedAt: null,
      },
      select: { id: true },
    });

    if (!invite) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    await prisma.organizationInvite.update({
      where: { id: invite.id },
      data: { revokedAt: new Date() },
    });

    await appendConsoleAudit({
      organizationId: scoped.activeOrgId,
      actorIdentityId: scoped.identityLinkId,
      action: "invite_revoked",
      targetType: "organization_invite",
      targetId: invite.id,
    });

    return NextResponse.json({ revoked: true });
  });
}
