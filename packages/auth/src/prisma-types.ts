/** Row from `findUnique` with `select: { id: true }`. */
export type SalInternalUserIdRow = { id: string };

/** Row from `findUnique` with `select: { role: true }`. */
export type SalInternalUserRoleRow = { role: string };

/** Row from `user.findUnique` with `select: { id: true }`. */
export type AuthUserIdRow = { id: string };

/** Row from `identityLink.findUnique` with nested memberships select. */
export type IdentityLinkMembershipsRow = {
  memberships?: { id: string }[];
};

/**
 * Minimal Prisma surface used by @salanor/auth (no generated client import).
 * Permissive `findUnique` keeps real PrismaClient assignable at app call sites.
 */
export type AuthUserSuspendedRow = { platformSuspendedAt: Date | null };

export type SalanorAuthPrisma = {
  salInternalUser: {
    findUnique(args: unknown): Promise<unknown | null>;
    upsert?(args: unknown): Promise<unknown>;
  };
  user: {
    findUnique(args: unknown): Promise<unknown | null>;
  };
  identityLink: {
    findUnique(args: unknown): Promise<unknown | null>;
  };
  organizationInvite: {
    findFirst(args: unknown): Promise<unknown | null>;
  };
};
