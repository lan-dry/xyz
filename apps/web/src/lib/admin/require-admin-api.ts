import { auth } from "@/auth";

import { resolveAdminAccess, type AdminAccessContext } from "./internal-user";
import { type AdminPermission, requireAdminPermission } from "./roles";

export type AdminApiContext = AdminAccessContext & {
  userId: string;
};

export async function requireAdminApi(): Promise<AdminApiContext | null> {
  const session = await auth();
  if (!session?.user?.id || session.user.accessBlocked) {
    return null;
  }

  const access = await resolveAdminAccess(session.user.email);
  if (!access) return null;

  return {
    ...access,
    userId: session.user.id,
  };
}

export async function requireAdminApiPermission(
  permission: AdminPermission,
): Promise<AdminApiContext | null> {
  const ctx = await requireAdminApi();
  if (!ctx) return null;
  try {
    requireAdminPermission(ctx.role, permission);
    return ctx;
  } catch {
    return null;
  }
}
