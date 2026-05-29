import { NextRequest, NextResponse } from "next/server";

import { appendConsoleAudit } from "@/lib/console/audit";
import { updateMembershipRole } from "@/lib/console/identity";
import { withConsoleOrg } from "@/lib/console/api-route";
import type { OrganizationRole } from "@/lib/console/roles";
import { requireConsoleContextApi } from "@/lib/console/session";

const ROLES: OrganizationRole[] = ["owner", "admin", "developer", "compliance", "viewer"];

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const ctx = await requireConsoleContextApi();

  return withConsoleOrg(ctx.activeOrgId, "admin", async (scoped) => {
    let body: { role?: string };
    try {
      body = (await req.json()) as { role?: string };
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const role = body.role as OrganizationRole | undefined;
    if (!role || !ROLES.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const before = await updateMembershipRole({
      organizationId: scoped.activeOrgId,
      membershipId: id,
      role,
      actorIdentityId: scoped.identityLinkId,
      actorRole: scoped.membership.role,
    });

    await appendConsoleAudit({
      organizationId: scoped.activeOrgId,
      actorIdentityId: scoped.identityLinkId,
      action: "role_changed",
      targetType: "organization_membership",
      targetId: id,
      metadata: { role },
    });

    return NextResponse.json({
      id: before.id,
      role: before.role,
    });
  });
}
