import { isInternalRole, type InternalRole } from "@salanor/auth/internal-roles";
import type { SalInternalUserRoleRow } from "@salanor/auth/prisma-types";

import { prisma } from "@/lib/prisma";

import { type AdminPermission, permissionsForRole } from "./roles";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function getInternalRoleForEmail(
  email: string | null | undefined,
): Promise<InternalRole | null> {
  if (!email?.trim()) return null;
  const row = (await prisma.salInternalUser.findUnique({
    where: { email: normalizeEmail(email) },
    select: { role: true },
  })) as SalInternalUserRoleRow | null;
  const role = row?.role;
  return isInternalRole(role) ? role : null;
}

export type AdminAccessContext = {
  email: string;
  role: InternalRole;
  permissions: AdminPermission[];
};

export async function resolveAdminAccess(
  email: string | null | undefined,
): Promise<AdminAccessContext | null> {
  const role = await getInternalRoleForEmail(email);
  if (!role || !email?.trim()) return null;
  return {
    email: normalizeEmail(email),
    role,
    permissions: permissionsForRole(role),
  };
}
