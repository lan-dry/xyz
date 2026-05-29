/** Roles stored on `sal_internal_users.role`. */
export const INTERNAL_ROLES = ["superadmin", "eng", "support"] as const;

export type InternalRole = (typeof INTERNAL_ROLES)[number];

export function isInternalRole(value: string | null | undefined): value is InternalRole {
  return typeof value === "string" && (INTERNAL_ROLES as readonly string[]).includes(value);
}
