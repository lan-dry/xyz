import type { OrganizationRole } from "@prisma/client";

export type { OrganizationRole };

const ROLE_RANK: Record<OrganizationRole, number> = {
  viewer: 1,
  compliance: 2,
  developer: 3,
  admin: 4,
  owner: 5,
};

export function roleMeetsMinimum(role: OrganizationRole, minRole: OrganizationRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

export class ConsoleForbiddenError extends Error {
  readonly status = 403;

  constructor(message = "Forbidden") {
    super(message);
    this.name = "ConsoleForbiddenError";
  }
}

export class ConsoleUnauthorizedError extends Error {
  readonly status = 401;

  constructor(message = "Unauthorized") {
    super(message);
    this.name = "ConsoleUnauthorizedError";
  }
}

/** Throws when membership role is below `minRole`. */
export function requireRole(
  membership: { role: OrganizationRole } | null | undefined,
  minRole: OrganizationRole,
): asserts membership is { role: OrganizationRole } {
  if (!membership) {
    throw new ConsoleForbiddenError("Not a member of this organization");
  }
  if (!roleMeetsMinimum(membership.role, minRole)) {
    throw new ConsoleForbiddenError(`Requires ${minRole} role or higher`);
  }
}
