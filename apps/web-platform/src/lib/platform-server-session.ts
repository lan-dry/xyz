import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  canPlatform,
  type PlatformPermission,
  type PlatformRole,
} from "@/lib/platform-permissions";

export type PlatformServerSession = {
  staff: true;
  email: string;
  display_name: string | null;
  account_id: string;
  platform_role: PlatformRole;
};

function idApiBase(): string {
  return (process.env.SALANOR_ID_URL?.trim() || "http://127.0.0.1:8091").replace(/\/$/, "");
}

export async function getPlatformSessionServer(): Promise<PlatformServerSession | null> {
  const jar = await cookies();
  const cookie = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  if (!cookie) return null;

  const res = await fetch(`${idApiBase()}/v1/id/platform/session`, {
    headers: { cookie },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as PlatformServerSession;
  if (!data.staff || !data.platform_role) return null;
  return data;
}

export async function requirePlatformSession(
  permission: PlatformPermission,
): Promise<PlatformServerSession> {
  const session = await getPlatformSessionServer();
  if (!session || !canPlatform(session.platform_role, permission)) {
    redirect("/login");
  }
  return session;
}

export async function assertPlatformSessionAction(
  permission: PlatformPermission,
): Promise<PlatformServerSession> {
  const session = await getPlatformSessionServer();
  if (!session || !canPlatform(session.platform_role, permission)) {
    throw new Error("Forbidden");
  }
  return session;
}
