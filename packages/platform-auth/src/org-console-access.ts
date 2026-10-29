import type { ConsoleSession } from "./session.js";

/** Roles that may read org administration APIs (members, invitations, security). */
export const ORG_CONSOLE_READ_ROLES = new Set([
  "admin",
  "owner",
  "approver",
  "auditor",
  "engineer",
  "developer",
]);

/** Roles that may mutate org membership, invitations, SCIM, policies, and org profile. */
export const ORG_CONSOLE_WRITE_ROLES = new Set(["admin", "owner"]);

/** Roles that may decide Ask-a-person approvals (not policies). */
export const ORG_APPROVER_ROLES = new Set(["admin", "owner", "approver"]);

export function normalizeOrgRole(role: string): string {
  const r = role.trim().toLowerCase();
  // Phase 6 product name; DB still accepts engineer.
  if (r === "developer") return "engineer";
  return r;
}

export function canReadOrgConsole(
  session: ConsoleSession,
  organizationId: string,
): boolean {
  if (session.organizationId !== organizationId) {
    return false;
  }
  const role = normalizeOrgRole(session.role);
  return (
    ORG_CONSOLE_READ_ROLES.has(role) ||
    ORG_CONSOLE_READ_ROLES.has(session.role.trim().toLowerCase())
  );
}

export function canWriteOrgConsole(
  session: ConsoleSession,
  organizationId: string,
): boolean {
  if (session.organizationId !== organizationId) {
    return false;
  }
  return ORG_CONSOLE_WRITE_ROLES.has(normalizeOrgRole(session.role));
}

/** Approve / decline / reassign Ask-a-person — Approver role included; Auditor never. */
export function canDecideApprovals(
  session: ConsoleSession,
  organizationId: string,
): boolean {
  if (session.organizationId !== organizationId) {
    return false;
  }
  return ORG_APPROVER_ROLES.has(normalizeOrgRole(session.role));
}

export function isOrgConsoleReadOnly(
  session: ConsoleSession,
  organizationId: string,
): boolean {
  return (
    canReadOrgConsole(session, organizationId) &&
    !canWriteOrgConsole(session, organizationId)
  );
}
