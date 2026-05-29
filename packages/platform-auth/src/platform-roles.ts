/** Salanor Platform Ops roles — one role per account (NULL = not staff). */

export type PlatformRole = "superadmin" | "admin" | "staff";

export const PLATFORM_ROLES: PlatformRole[] = ["superadmin", "admin", "staff"];

export type PlatformPermission =
  | "platform:read"
  | "platform:provision"
  | "platform:orgs.write"
  | "platform:accounts.write"
  | "platform:plans.write"
  | "platform:roles.write"
  | "platform:impersonate";

const ROLE_PERMISSIONS: Record<PlatformRole, readonly PlatformPermission[]> = {
  superadmin: [
    "platform:read",
    "platform:provision",
    "platform:orgs.write",
    "platform:accounts.write",
    "platform:plans.write",
    "platform:roles.write",
    "platform:impersonate",
  ],
  admin: [
    "platform:read",
    "platform:provision",
    "platform:orgs.write",
    "platform:accounts.write",
    "platform:plans.write",
    "platform:roles.write",
    "platform:impersonate",
  ],
  staff: ["platform:read"],
};

export function isPlatformRole(value: string | null | undefined): value is PlatformRole {
  return value === "superadmin" || value === "admin" || value === "staff";
}

export function platformRoleHasPermission(
  role: PlatformRole | null | undefined,
  permission: PlatformPermission,
): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function canActorAssignPlatformRole(
  actorRole: PlatformRole,
  targetCurrentRole: PlatformRole | null,
  newRole: PlatformRole | null,
): { allowed: boolean; reason?: string } {
  if (actorRole === "staff") {
    return { allowed: false, reason: "Platform staff cannot change platform roles" };
  }
  if (newRole === "superadmin" && actorRole !== "superadmin") {
    return { allowed: false, reason: "Only super admin can grant super admin" };
  }
  if (targetCurrentRole === "superadmin" && actorRole !== "superadmin") {
    return { allowed: false, reason: "Only super admin can modify a super admin account" };
  }
  return { allowed: true };
}

export function platformRoleLabel(role: PlatformRole | null): string {
  if (!role) return "None";
  switch (role) {
    case "superadmin":
      return "Super admin";
    case "admin":
      return "Platform admin";
    case "staff":
      return "Platform staff";
  }
}

export const PLATFORM_ROLE_DESCRIPTIONS: Record<
  PlatformRole,
  { summary: string; can: string[]; cannot: string[] }
> = {
  superadmin: {
    summary: "Full Platform Ops access including granting platform roles.",
    can: [
      "Everything platform admin can do",
      "Assign or revoke platform roles on accounts",
      "Impersonate any customer org in console",
    ],
    cannot: ["Cannot demote the last super admin"],
  },
  admin: {
    summary: "Day-to-day operations — provision customers, plans, account support.",
    can: [
      "Provision organizations",
      "Edit org plans and status",
      "Suspend accounts, reset passwords",
      "Edit plan catalog",
      "View audit log and leads",
      "Impersonate customer orgs in console (audited)",
    ],
    cannot: ["Grant or change super admin role; cannot modify super admin accounts"],
  },
  staff: {
    summary: "Read-only across tenants — support and visibility without mutations.",
    can: ["View overview, organizations, accounts, audit log, leads"],
    cannot: ["Impersonate orgs, provision, edit plans, suspend accounts, or change platform roles"],
  },
};
