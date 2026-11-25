/** Client-side role helpers mirroring @salanor/platform-auth org-console-access. */

export function normalizeOrgRole(role: string | null | undefined): string {
  const r = (role ?? "").trim().toLowerCase();
  if (r === "developer") return "engineer";
  return r;
}

/** Settings, keys, invites, org profile. */
export function canManageOrg(role: string | null | undefined): boolean {
  const r = normalizeOrgRole(role);
  return r === "admin" || r === "owner";
}

/** Approve / reject held cases. */
export function canDecideApprovals(role: string | null | undefined): boolean {
  const r = normalizeOrgRole(role);
  return r === "admin" || r === "owner" || r === "approver";
}

export type InviteRoleOption = {
  value: "admin" | "approver" | "auditor" | "engineer" | "viewer" | "owner";
  label: string;
  hint: string;
};

/** Roles shown when inviting into a sandbox (prospect first hour). */
export const SANDBOX_INVITE_ROLE_OPTIONS: InviteRoleOption[] = [
  {
    value: "admin",
    label: "Admin",
    hint: "Full access — settings, keys, invites, approvals.",
  },
  {
    value: "approver",
    label: "Approver",
    hint: "Approve or reject held cases. No settings or keys.",
  },
  {
    value: "auditor",
    label: "Auditor",
    hint: "Read-only — view cases and download evidence.",
  },
];

/** Broader set for real tenants (still no engineer-as-default). */
export const REAL_INVITE_ROLE_OPTIONS: InviteRoleOption[] = [
  ...SANDBOX_INVITE_ROLE_OPTIONS,
  {
    value: "engineer",
    label: "Engineer",
    hint: "Build and integrate; cannot change org settings.",
  },
  {
    value: "viewer",
    label: "Viewer",
    hint: "Limited read access.",
  },
];
