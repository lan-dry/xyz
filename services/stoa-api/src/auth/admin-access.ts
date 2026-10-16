import type { Context } from "hono";
import type { ConsoleSession } from "@salanor/platform-auth";
import { getPool } from "../db/pool.js";
import type { StoaContext } from "./session-context.js";

declare module "hono" {
  interface ContextVariableMap {
    adminAccess: AdminConsoleAccess;
  }
}

export type AdminConsoleAccess = {
  role: string;
  /** Full org admin read (admin, owner, auditor, engineer). */
  canReadOrg: boolean;
  /** Mutating org admin (admin, owner only). */
  canWriteOrg: boolean;
  /** Read-only org console (auditor, engineer). */
  readOnlyOrg: boolean;
  managedSiteIds: string[];
  /** Site manager without org read (delegated branch admin). */
  siteManagerOnly: boolean;
  /** May open any admin UI route. */
  canAccessConsole: boolean;
};

const ORG_WRITE_ROLES = new Set(["admin", "owner"]);
const ORG_READ_ROLES = new Set(["admin", "owner", "auditor", "engineer"]);

function sessionRole(ctx: StoaContext): string {
  if (ctx.authMode === "dev") {
    return "admin";
  }
  return ctx.session?.role?.toLowerCase() ?? "viewer";
}

export async function resolveAdminConsoleAccess(
  ctx: StoaContext,
): Promise<AdminConsoleAccess> {
  const role = sessionRole(ctx);
  const canWriteOrg = ORG_WRITE_ROLES.has(role);
  const canReadOrg = ORG_READ_ROLES.has(role);

  let managedSiteIds: string[] = [];
  if (ctx.authMode === "session" || ctx.authMode === "dev") {
    const rows = await getPool().query<{ site_id: string }>(
      `SELECT site_id FROM stoa_site_manager
       WHERE tenant_id = $1 AND stoa_user_id = $2`,
      [ctx.tenantId, ctx.userId],
    );
    managedSiteIds = rows.rows.map((r) => r.site_id);
  }

  const siteManagerOnly = !canReadOrg && managedSiteIds.length > 0;
  const canAccessConsole = canReadOrg || managedSiteIds.length > 0;

  return {
    role,
    canReadOrg,
    canWriteOrg,
    readOnlyOrg: canReadOrg && !canWriteOrg,
    managedSiteIds,
    siteManagerOnly,
    canAccessConsole,
  };
}

export async function loadAdminAccess(c: Context): Promise<AdminConsoleAccess> {
  const existing = c.get("adminAccess") as AdminConsoleAccess | undefined;
  if (existing) {
    return existing;
  }
  const access = await resolveAdminConsoleAccess(c.get("stoa"));
  c.set("adminAccess", access);
  return access;
}

export function adminAccessForbidden(c: Context, message: string) {
  return c.json({ error: message }, 403);
}

/** Org-wide admin read, or any site manager for site-scoped routes. */
export async function requireConsoleRead(c: Context): Promise<AdminConsoleAccess | null> {
  const access = await loadAdminAccess(c);
  if (access.canReadOrg || access.managedSiteIds.length > 0) {
    return access;
  }
  return null;
}

/** Org-wide admin read only (no site-manager-only). */
export async function requireOrgRead(c: Context): Promise<AdminConsoleAccess | null> {
  const access = await loadAdminAccess(c);
  if (access.canReadOrg) {
    return access;
  }
  return null;
}

export async function requireOrgWrite(c: Context): Promise<AdminConsoleAccess | null> {
  const access = await loadAdminAccess(c);
  if (access.canWriteOrg) {
    return access;
  }
  return null;
}

export function canManageSite(
  access: AdminConsoleAccess,
  siteId: string,
): boolean {
  if (access.canReadOrg) {
    return true;
  }
  return access.managedSiteIds.includes(siteId);
}

export function canWriteSiteMembership(
  access: AdminConsoleAccess,
  siteId: string | null,
): boolean {
  if (access.canWriteOrg) {
    return true;
  }
  if (!siteId) {
    return false;
  }
  return access.managedSiteIds.includes(siteId);
}

export function sessionForAudit(c: Context): ConsoleSession | null {
  const ctx = c.get("stoa");
  return ctx.session ?? null;
}
