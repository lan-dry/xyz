import { NextRequest, NextResponse } from "next/server";

import { appendConsoleAudit } from "@/lib/console/audit";
import { withConsoleAuth } from "@/lib/console/api-route";
import { ensureIdentityLink } from "@/lib/console/identity";
import { hashInviteToken, isValidInviteToken, normalizeInviteEmail } from "@/lib/console/invites";
import { setActiveOrgCookie } from "@/lib/console/session";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  return withConsoleAuth(async (ctx) => {
    let body: { token?: string };
    try {
      body = (await req.json()) as { token?: string };
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const token = body.token?.trim();
    if (!isValidInviteToken(token)) {
      return NextResponse.json({ error: "Invalid invite token" }, { status: 400 });
    }

    const signedInEmail = normalizeInviteEmail(ctx.email);
    const tokenHash = hashInviteToken(token);
    const now = new Date();
    const identity = await ensureIdentityLink(ctx.userId, signedInEmail);

    const invite = await prisma.organizationInvite.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        organizationId: true,
      },
    });

    if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt <= now) {
      return NextResponse.json({ error: "Invite is invalid or expired" }, { status: 410 });
    }

    if (normalizeInviteEmail(invite.email) !== signedInEmail) {
      return NextResponse.json({ error: "Invite email does not match signed-in account" }, { status: 403 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.organizationMembership.upsert({
        where: {
          organizationId_identityLinkId: {
            organizationId: invite.organizationId,
            identityLinkId: identity.id,
          },
        },
        update: {},
        create: {
          organizationId: invite.organizationId,
          identityLinkId: identity.id,
          role: invite.role,
          invitedById: null,
        },
      });

      await tx.organizationInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: now },
      });
    });

    await appendConsoleAudit({
      organizationId: invite.organizationId,
      actorIdentityId: identity.id,
      action: "invite_accepted",
      targetType: "organization_invite",
      targetId: invite.id,
      metadata: { email: signedInEmail, role: invite.role },
    });

    await setActiveOrgCookie(invite.organizationId);

    return NextResponse.json({ accepted: true, organizationId: invite.organizationId });
  });
}
