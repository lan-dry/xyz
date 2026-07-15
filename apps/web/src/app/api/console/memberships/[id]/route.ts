import { NextResponse } from "next/server";

import { appendConsoleAudit } from "@/lib/console/audit";
import { withConsoleOrg } from "@/lib/console/api-route";
import { removeMembership } from "@/lib/console/identity";
import { requireConsoleContextApi } from "@/lib/console/session";

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const ctx = await requireConsoleContextApi();

  return withConsoleOrg(ctx.activeOrgId, "admin", async (scoped) => {
    const removed = await removeMembership({
      organizationId: scoped.activeOrgId,
      membershipId: id,
      actorIdentityId: scoped.identityLinkId,
      actorRole: scoped.membership.role,
    });

    await appendConsoleAudit({
      organizationId: scoped.activeOrgId,
      actorIdentityId: scoped.identityLinkId,
      action: "member_removed",
      targetType: "organization_membership",
      targetId: removed.id,
      metadata: {
        removedIdentityLinkId: removed.identityLinkId,
        removedRole: removed.role,
      },
    });

    return NextResponse.json({ removed: true, id: removed.id });
  });
}
