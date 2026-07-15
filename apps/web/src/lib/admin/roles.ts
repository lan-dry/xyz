import type { InternalRole } from "@salanor/auth/internal-roles";
import { isInternalRole } from "@salanor/auth/internal-roles";

export type { InternalRole };
export { isInternalRole };

const ROLE_RANK: Record<InternalRole, number> = {
  support: 1,
  eng: 2,
  superadmin: 3,
};

export type AdminPermission =
  | "admin:access"
  | "admin:contacts:read"
  | "admin:contacts:write"
  | "admin:cms:read"
  | "admin:cms:write"
  | "admin:tenants:read"
  | "admin:users:suspend"
  | "admin:internal-users:manage";

const ROLE_PERMISSIONS: Record<InternalRole, readonly AdminPermission[]> = {
  superadmin: [
    "admin:access",
    "admin:contacts:read",
    "admin:contacts:write",
    "admin:cms:read",
    "admin:cms:write",
    "admin:tenants:read",
    "admin:users:suspend",
    "admin:internal-users:manage",
  ],
  eng: ["admin:access", "admin:cms:read", "admin:tenants:read"],
  support: [
    "admin:access",
    "admin:contacts:read",
    "admin:contacts:write",
    "admin:cms:read",
    "admin:tenants:read",
  ],
};

export function roleMeetsMinimum(role: InternalRole, minRole: InternalRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

export function hasAdminPermission(role: InternalRole, permission: AdminPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsForRole(role: InternalRole): AdminPermission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function canWriteAdminCms(role: InternalRole): boolean {
  return hasAdminPermission(role, "admin:cms:write");
}

export function canWriteAdminContacts(role: InternalRole): boolean {
  return hasAdminPermission(role, "admin:contacts:write");
}

export function isAdminReadOnly(role: InternalRole): boolean {
  return !canWriteAdminCms(role) && !canWriteAdminContacts(role);
}

export class AdminForbiddenError extends Error {
  readonly status = 403;

  constructor(message = "Forbidden") {
    super(message);
    this.name = "AdminForbiddenError";
  }
}

export function requireAdminPermission(
  role: InternalRole | null | undefined,
  permission: AdminPermission,
): asserts role is InternalRole {
  if (!role || !hasAdminPermission(role, permission)) {
    throw new AdminForbiddenError(`Requires ${permission}`);
  }
}

export function requireInternalRole(
  role: InternalRole | null | undefined,
  minRole: InternalRole,
): asserts role is InternalRole {
  if (!role || !roleMeetsMinimum(role, minRole)) {
    throw new AdminForbiddenError(`Requires ${minRole} role or higher`);
  }
}
