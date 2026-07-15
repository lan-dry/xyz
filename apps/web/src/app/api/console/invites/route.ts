import { NextRequest, NextResponse } from "next/server";

import { appendConsoleAudit } from "@/lib/console/audit";
import { withConsoleOrg } from "@/lib/console/api-route";
import {
  buildInviteAcceptUrl,
  generateInviteToken,
  getInviteCreationBlockReason,
  inviteExpiryDate,
  normalizeInviteEmail,
  sendOrganizationInviteEmail,
} from "@/lib/console/invites";
import type { OrganizationRole } from "@/lib/console/roles";
import { requireConsoleContextApi } from "@/lib/console/session";
import { prisma } from "@/lib/prisma";

const INVITABLE_ROLES: OrganizationRole[] = ["admin", "developer", "compliance", "viewer"];

export async function GET() {
  const ctx = await requireConsoleContextApi();
  return withConsoleOrg(ctx.activeOrgId, "admin", async (scoped) => {
    const invites = await prisma.organizationInvite.findMany({
      where: {
        organizationId: scoped.activeOrgId,
        acceptedAt: null,
        revokedAt: null,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
        invitedBy: {
          select: {
            id: true,
            primaryEmail: true,
          },
        },
      },
    });
    return NextResponse.json({ invites });
  });
}

export async function POST(req: NextRequest) {
  const ctx = await requireConsoleContextApi();
  return withConsoleOrg(ctx.activeOrgId, "admin", async (scoped) => {
    let body: { email?: string; role?: string };
    try {
      body = (await req.json()) as { email?: string; role?: string };
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const email = normalizeInviteEmail(body.email ?? "");
    if (!email) {
      return NextResponse.json({ error: "email required" }, { status: 400 });
    }

    const role = body.role as OrganizationRole | undefined;
    if (!role || !INVITABLE_ROLES.includes(role)) {
      return NextResponse.json({ error: "Invalid invite role" }, { status: 400 });
    }

    const blockReason = await getInviteCreationBlockReason(prisma, scoped.activeOrgId, email);
    if (blockReason === "already_member") {
      return NextResponse.json({ error: "This person is already a member" }, { status: 409 });
    }
    if (blockReason === "already_invited") {
      return NextResponse.json({ error: "An invite is already pending for this email" }, { status: 409 });
    }

    const { token, tokenHash } = generateInviteToken();
    const expiresAt = inviteExpiryDate();
    const acceptUrl = buildInviteAcceptUrl(token);

    const [org, actor] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: scoped.activeOrgId },
        select: { id: true, name: true, slug: true },
      }),
      prisma.identityLink.findUnique({
        where: { id: scoped.identityLinkId },
        select: { id: true, primaryEmail: true },
      }),
    ]);

    if (!org || !actor) {
      return NextResponse.json({ error: "Organization context missing" }, { status: 400 });
    }

    const invite = await prisma.organizationInvite.create({
      data: {
        organizationId: scoped.activeOrgId,
        email,
        role,
        tokenHash,
        expiresAt,
        invitedById: scoped.identityLinkId,
      },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
        invitedBy: {
          select: {
            primaryEmail: true,
          },
        },
      },
    });

    try {
      await sendOrganizationInviteEmail({
        toEmail: email,
        orgName: org.name,
        role,
        invitedByEmail: actor.primaryEmail,
        acceptUrl,
        expiresAt,
      });
    } catch (err) {
      await prisma.organizationInvite.delete({ where: { id: invite.id } });
      const message = err instanceof Error ? err.message : "Failed to send invite email";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    await appendConsoleAudit({
      organizationId: scoped.activeOrgId,
      actorIdentityId: scoped.identityLinkId,
      action: "invite_created",
      targetType: "organization_invite",
      targetId: invite.id,
      metadata: { email, role },
    });

    return NextResponse.json({ invite }, { status: 201 });
  });
}
