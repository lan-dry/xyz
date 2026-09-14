import type { AuthUserIdRow, IdentityLinkMembershipsRow, SalanorAuthPrisma } from "./prisma-types";

/** Shown when sign-in succeeds for auth but user has no console org membership. */
export const CONSOLE_ACCESS_DENIED_MESSAGE =
  "Your account is not a member of any Aegis organization. Ask your administrator for an invite.";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** True when the user has at least one organization membership (console RBAC). */
export async function hasConsoleMembership(
  prisma: SalanorAuthPrisma,
  userId: string,
): Promise<boolean> {
  const link = (await prisma.identityLink.findUnique({
    where: { userId },
    select: {
      memberships: { select: { id: true }, take: 1 },
    },
  })) as IdentityLinkMembershipsRow | null;
  return (link?.memberships?.length ?? 0) > 0;
}

/** True when email resolves to a user with console membership. */
export async function hasConsoleMembershipByEmail(
  prisma: SalanorAuthPrisma,
  email: string | null | undefined,
): Promise<boolean> {
  if (!email?.trim()) return false;
  const user = (await prisma.user.findUnique({
    where: { email: normalizeEmail(email) },
    select: { id: true },
  })) as AuthUserIdRow | null;
  if (!user) return false;
  return hasConsoleMembership(prisma, user.id);
}

/** True when email has an active organization invite to the console. */
export async function hasPendingConsoleInviteByEmail(
  prisma: SalanorAuthPrisma,
  email: string | null | undefined,
): Promise<boolean> {
  if (!email?.trim()) return false;
  const invite = await prisma.organizationInvite.findFirst({
    where: {
      email: normalizeEmail(email),
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  return Boolean(invite);
}

/** Sign-in allowed for marketing admin, pending invite, OR console org member. */
export async function isAllowedProductSignIn(
  prisma: SalanorAuthPrisma,
  email: string | null | undefined,
  isAdmin: (e: string | null | undefined) => Promise<boolean>,
): Promise<boolean> {
  if (await isAdmin(email)) return true;
  if (process.env.AEGIS_CONSOLE_AUTO_PROVISION === "1" && email?.trim()) {
    return true;
  }
  if (await hasPendingConsoleInviteByEmail(prisma, email)) {
    return true;
  }
  return hasConsoleMembershipByEmail(prisma, email);
}
