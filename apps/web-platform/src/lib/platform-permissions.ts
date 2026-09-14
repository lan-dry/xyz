/** Client-side mirror of server platform permissions (UI gating only). */

export type PlatformRole = "superadmin" | "admin" | "staff";

export type PlatformPermission =
  | "platform:read"
  | "platform:provision"
  | "platform:orgs.write"
  | "platform:accounts.write"
  | "platform:plans.write"
  | "platform:roles.write"
  | "platform:impersonate";

const ROLE_PERMISSIONS: Record<PlatformRole, PlatformPermission[]> = {
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

export function canPlatform(role: PlatformRole | null | undefined, permission: PlatformPermission) {
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

export function platformRoleOptionsForActor(
  actorRole: PlatformRole,
  targetCurrentRole: PlatformRole | null,
): Array<{ value: PlatformRole | null; label: string }> {
  const all = [
    { value: null as PlatformRole | null, label: "None (customer only)" },
    { value: "staff" as const, label: "Platform staff (read-only)" },
    { value: "admin" as const, label: "Platform admin" },
    { value: "superadmin" as const, label: "Super admin" },
  ];
  if (actorRole !== "superadmin") {
    return all.filter((o) => o.value !== "superadmin");
  }
  if (targetCurrentRole === "superadmin" && actorRole !== "superadmin") {
    return [];
  }
  return all;
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
