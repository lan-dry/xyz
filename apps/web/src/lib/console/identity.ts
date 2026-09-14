import { Prisma } from "@prisma/client";
import type { IdentityLink, Organization, OrganizationMembership, OrganizationRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { DEV_ORGANIZATION_ID } from "./constants";
import { resolveDevOrganizationId } from "./dev-org";
import { ConsoleForbiddenError, roleMeetsMinimum } from "./roles";

const AUTO_PROVISION_TRUTHY = new Set(["1", "true", "yes", "on"]);

export function isConsoleAutoProvisionEnabled(): boolean {
  const raw = process.env.AEGIS_CONSOLE_AUTO_PROVISION;
  if (!raw) {
    return false;
  }
  const normalized = raw.trim().replace(/^['"]|['"]$/g, "").toLowerCase();
  return AUTO_PROVISION_TRUTHY.has(normalized);
}

async function resolveAutoProvisionOrganizationId(configuredOrgId: string): Promise<string> {
  const byId = await prisma.organization.findUnique({
    where: { id: configuredOrgId },
    select: { id: true },
  });
  if (byId) {
    return byId.id;
  }

  const bySlug = await prisma.organization.findUnique({
    where: { slug: "dev-org" },
    select: { id: true },
  });
  if (bySlug) {
    return bySlug.id;
  }

  const created = await prisma.organization.create({
    data: {
      id: configuredOrgId,
      name: "Dev Organization",
      slug: "dev-org",
      plan: "starter",
    },
    select: { id: true },
  });
  return created.id;
}

export async function ensureIdentityLink(
  userId: string,
  email: string,
): Promise<IdentityLink> {
  const primaryEmail = email.trim().toLowerCase();
  return prisma.identityLink.upsert({
    where: { userId },
    create: { userId, primaryEmail },
    update: { primaryEmail },
  });
}

/** Dev-only: attach first-time console user to seed org when flag set. */
export async function maybeAutoProvisionDevMembership(
  identityLinkId: string,
): Promise<OrganizationMembership | null> {
  if (!isConsoleAutoProvisionEnabled()) {
    return null;
  }

  const configuredOrgId = resolveDevOrganizationId();
  const existing = await prisma.organizationMembership.findFirst({
    where: { identityLinkId },
  });
  if (existing) return existing;

  const organizationId = await resolveAutoProvisionOrganizationId(configuredOrgId);
  try {
    return await prisma.organizationMembership.create({
      data: {
        organizationId,
        identityLinkId,
        role: "owner",
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return prisma.organizationMembership.findFirst({
        where: { identityLinkId, organizationId },
      });
    }
    throw err;
  }
}

export type ConsoleMembership = OrganizationMembership & {
  organization: Organization;
};

export async function listMemberships(identityLinkId: string): Promise<ConsoleMembership[]> {
  return prisma.organizationMembership.findMany({
    where: { identityLinkId },
    include: { organization: true },
    orderBy: { organization: { name: "asc" } },
  });
}

export async function getMembership(
  identityLinkId: string,
  organizationId: string,
): Promise<ConsoleMembership | null> {
  return prisma.organizationMembership.findUnique({
    where: {
      organizationId_identityLinkId: {
        organizationId,
        identityLinkId,
      },
    },
    include: { organization: true },
  });
}

export async function updateMembershipRole(input: {
  organizationId: string;
  membershipId: string;
  role: OrganizationRole;
  actorIdentityId: string;
  actorRole: OrganizationRole;
}): Promise<ConsoleMembership> {
  const target = await prisma.organizationMembership.findUnique({
    where: { id: input.membershipId },
    include: { organization: true },
  });
  if (!target || target.organizationId !== input.organizationId) {
    throw new ConsoleForbiddenError("Membership not found");
  }

  const actorIsOwner = input.actorRole === "owner";
  const actorIsAdmin = input.actorRole === "admin";
  if (!actorIsOwner && !actorIsAdmin) {
    throw new ConsoleForbiddenError("Requires admin role or higher");
  }

  // Admins cannot modify owner memberships or assign owner.
  if (actorIsAdmin && (target.role === "owner" || input.role === "owner")) {
    throw new ConsoleForbiddenError("Only owners can modify owner roles");
  }

  const targetIsSelf = target.identityLinkId === input.actorIdentityId;
  if (target.role === "owner" && input.role !== "owner") {
    const ownerCount = await prisma.organizationMembership.count({
      where: { organizationId: input.organizationId, role: "owner" },
    });
    if (ownerCount <= 1) {
      throw new ConsoleForbiddenError(
        targetIsSelf
          ? "You cannot change your own role while you are the only owner"
          : "Cannot demote the last owner",
      );
    }
  }

  const updated = await prisma.organizationMembership.update({
    where: { id: input.membershipId },
    data: { role: input.role },
    include: { organization: true },
  });
  return updated;
}

export async function removeMembership(input: {
  organizationId: string;
  membershipId: string;
  actorIdentityId: string;
  actorRole: OrganizationRole;
}): Promise<ConsoleMembership> {
  const target = await prisma.organizationMembership.findUnique({
    where: { id: input.membershipId },
    include: { organization: true },
  });
  if (!target || target.organizationId !== input.organizationId) {
    throw new ConsoleForbiddenError("Membership not found");
  }

  if (!roleMeetsMinimum(input.actorRole, "admin")) {
    throw new ConsoleForbiddenError("Requires admin role or higher");
  }

  const actorIsAdminOnly = input.actorRole === "admin";
  if (actorIsAdminOnly && target.role === "owner") {
    throw new ConsoleForbiddenError("Only owners can remove owner memberships");
  }

  const targetIsSelf = target.identityLinkId === input.actorIdentityId;
  if (target.role === "owner") {
    const ownerCount = await prisma.organizationMembership.count({
      where: { organizationId: input.organizationId, role: "owner" },
    });
    if (ownerCount <= 1) {
      throw new ConsoleForbiddenError(
        targetIsSelf
          ? "You cannot remove yourself while you are the only owner"
          : "Cannot remove the last owner",
      );
    }
  }

  return prisma.organizationMembership.delete({
    where: { id: input.membershipId },
    include: { organization: true },
  });
}

export { DEV_ORGANIZATION_ID };
