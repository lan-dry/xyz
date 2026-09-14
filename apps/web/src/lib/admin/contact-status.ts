export const ADMIN_CONTACT_STATUSES = ["new", "in_progress", "resolved", "spam"] as const;

export type AdminContactStatus = (typeof ADMIN_CONTACT_STATUSES)[number];

export function isAdminContactStatus(value: string): value is AdminContactStatus {
  return ADMIN_CONTACT_STATUSES.includes(value as AdminContactStatus);
}
