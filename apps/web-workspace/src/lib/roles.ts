export const ROLES = ["viewer", "auditor", "admin", "engineer"] as const;

export type Role = (typeof ROLES)[number];

const ROLE_LABELS: Record<string, string> = {
  viewer: "Member",
  auditor: "Auditor",
  admin: "Administrator",
  owner: "Owner",
  engineer: "Engineer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  viewer: "Uses the workspace. No administration access.",
  auditor: "Views administration, usage and audit logs. Can't change settings.",
  admin: "Full administration access.",
  engineer: "Views administration. Can't change settings.",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role.toLowerCase()] ?? role;
}
