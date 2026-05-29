import { redirect } from "next/navigation";

import { auth } from "@/auth";

import { resolveAdminAccess, type AdminAccessContext } from "./internal-user";
import { type AdminPermission, requireAdminPermission } from "./roles";

export type AdminSessionContext = AdminAccessContext & {
  userId: string;
};

function redirectAccessDenied(): never {
  redirect("/sign-in?error=AccessDenied&callbackUrl=/admin");
}

function redirectSuspended(): never {
  redirect("/sign-in?error=Suspended&callbackUrl=/admin");
}

export async function requireAdminSession(): Promise<AdminSessionContext> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in?callbackUrl=/admin");
  }
  if (session.user.accessBlocked) {
    redirectSuspended();
  }

  const access = await resolveAdminAccess(session.user.email);
  if (!access) {
    redirectAccessDenied();
  }

  return {
    ...access,
    userId: session.user.id,
  };
}

export async function requireAdminPermissionSession(
  permission: AdminPermission,
): Promise<AdminSessionContext> {
  const ctx = await requireAdminSession();
  try {
    requireAdminPermission(ctx.role, permission);
  } catch {
    redirect("/admin?error=forbidden");
  }
  return ctx;
}
