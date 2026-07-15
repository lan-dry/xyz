import { MembersPanel } from "@/components/console/members-panel";
import { ConsolePageHeader } from "@/components/console/console-page-header";
import { roleMeetsMinimum } from "@/lib/console/roles";
import { resolveConsoleContext } from "@/lib/console/session";
import { prisma } from "@/lib/prisma";

export default async function ConsoleMembersPage() {
  const ctx = await resolveConsoleContext();
  if (!ctx) return null;

  const [memberships, invites] = await Promise.all([
    prisma.organizationMembership.findMany({
      where: { organizationId: ctx.activeOrgId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        identityLinkId: true,
        role: true,
        createdAt: true,
        identityLink: {
          select: {
            primaryEmail: true,
          },
        },
      },
    }),
    prisma.organizationInvite.findMany({
      where: {
        organizationId: ctx.activeOrgId,
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
            primaryEmail: true,
          },
        },
      },
    }),
  ]);

  const canManageInvites = roleMeetsMinimum(ctx.membership.role, "admin");
  const ownerCount = memberships.filter((membership) => membership.role === "owner").length;

  return (
    <section className="space-y-6">
      <ConsolePageHeader
        title="Members"
        subtitle="Manage organization members and invite teammates to this Aegis organization."
      />
      <div className="mt-6">
        <MembersPanel
          key={ctx.activeOrgId}
          canManageInvites={canManageInvites}
          actorRole={ctx.membership.role}
          actorIdentityLinkId={ctx.identityLinkId}
          ownerCount={ownerCount}
          members={memberships.map((membership) => ({
            id: membership.id,
            identityLinkId: membership.identityLinkId,
            email: membership.identityLink.primaryEmail,
            role: membership.role,
            createdAt: membership.createdAt.toISOString(),
          }))}
          invites={invites.map((invite) => ({
            id: invite.id,
            email: invite.email,
            role: invite.role,
            expiresAt: invite.expiresAt.toISOString(),
            createdAt: invite.createdAt.toISOString(),
            invitedByEmail: invite.invitedBy.primaryEmail,
          }))}
        />
      </div>
    </section>
  );
}
