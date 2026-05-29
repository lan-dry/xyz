import { NextRequest, NextResponse } from "next/server";

import { appendConsoleAudit } from "@/lib/console/audit";
import { getMembership } from "@/lib/console/identity";
import { ConsoleForbiddenError } from "@/lib/console/roles";
import { setActiveOrgCookie } from "@/lib/console/session";
import { withConsoleAuth } from "@/lib/console/api-route";

export async function POST(req: NextRequest) {
  return withConsoleAuth(async (ctx) => {
    let body: { organizationId?: string };
    try {
      body = (await req.json()) as { organizationId?: string };
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const organizationId = body.organizationId?.trim();
    if (!organizationId) {
      return NextResponse.json({ error: "organizationId required" }, { status: 400 });
    }

    const membership = await getMembership(ctx.identityLinkId, organizationId);
    if (!membership) {
      throw new ConsoleForbiddenError("Not a member of this organization");
    }

    await setActiveOrgCookie(organizationId);
    await appendConsoleAudit({
      organizationId,
      actorIdentityId: ctx.identityLinkId,
      action: "org_switched",
      metadata: { slug: membership.organization.slug },
    });

    return NextResponse.json({
      activeOrgId: organizationId,
      role: membership.role,
    });
  });
}
