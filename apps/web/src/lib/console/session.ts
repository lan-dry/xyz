import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { Session } from "next-auth";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CONSOLE_ORG_COOKIE } from "./constants";
import {
  ensureIdentityLink,
  getMembership,
  isConsoleAutoProvisionEnabled,
  listMemberships,
  maybeAutoProvisionDevMembership,
  type ConsoleMembership,
} from "./identity";
import {
  ConsoleForbiddenError,
  ConsoleUnauthorizedError,
  requireRole,
  type OrganizationRole,
} from "./roles";

export type ConsoleContext = {
  session: Session;
  userId: string;
  email: string;
  identityLinkId: string;
  activeOrgId: string;
  membership: ConsoleMembership;
  memberships: ConsoleMembership[];
};

export type ConsoleContextResolution = {
  context: ConsoleContext | null;
  autoProvisionEnabled: boolean;
  autoProvisionError?: string;
};

async function readActiveOrgCookie(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(CONSOLE_ORG_COOKIE)?.value;
}

export async function setActiveOrgCookie(organizationId: string): Promise<void> {
  const jar = await cookies();
  jar.set(CONSOLE_ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
}

export async function resolveConsoleContext(): Promise<ConsoleContext | null> {
  return (await resolveConsoleContextWithDiagnostics()).context;
}

function formatProvisionError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) {
    return err.message.trim();
  }
  return "Unknown provisioning error";
}

export async function resolveConsoleContextWithDiagnostics(): Promise<ConsoleContextResolution> {
  const autoProvisionEnabled = isConsoleAutoProvisionEnabled();
  const session = await auth();
  const userId = session?.user?.id;
  const email = session?.user?.email;
  if (!userId || !email || session.user.accessBlocked) {
    return { context: null, autoProvisionEnabled };
  }

  const identity = await ensureIdentityLink(userId, email);
  let autoProvisionError: string | undefined;
  try {
    await maybeAutoProvisionDevMembership(identity.id);
  } catch (err) {
    autoProvisionError = formatProvisionError(err);
  }

  const memberships = await listMemberships(identity.id);
  if (memberships.length === 0) {
    return { context: null, autoProvisionEnabled, autoProvisionError };
  }

  const cookieOrg = await readActiveOrgCookie();
  const active =
    memberships.find((m) => m.organizationId === cookieOrg) ?? memberships[0];

  return {
    autoProvisionEnabled,
    autoProvisionError,
    context: {
    session,
    userId,
    email,
    identityLinkId: identity.id,
    activeOrgId: active.organizationId,
    membership: active,
    memberships,
    },
  };
}

/** API-safe guard — throws instead of redirecting. */
export async function requireConsoleContextApi(): Promise<ConsoleContext> {
  const ctx = await resolveConsoleContext();
  if (!ctx) {
    throw new ConsoleUnauthorizedError("Console session required");
  }
  return ctx;
}

/** Server layout guard — redirects to sign-in when unauthenticated. */
export async function requireConsoleContext(): Promise<ConsoleContext> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in?callbackUrl=/console");
  }
  const ctx = await resolveConsoleContext();
  if (!ctx) {
    redirect("/sign-in?callbackUrl=/console&error=AccessDenied");
  }
  return ctx;
}

export async function requireConsoleRole(minRole: OrganizationRole): Promise<ConsoleContext> {
  const ctx = await requireConsoleContext();
  requireRole(ctx.membership, minRole);
  return ctx;
}

export async function requireConsoleOrgAccess(
  organizationId: string,
  minRole: OrganizationRole = "viewer",
): Promise<ConsoleContext & { membership: ConsoleMembership }> {
  const ctx = await requireConsoleContextApi();
  const membership = await getMembership(ctx.identityLinkId, organizationId);
  requireRole(membership, minRole);
  if (ctx.activeOrgId !== organizationId) {
    throw new ConsoleForbiddenError("Active organization mismatch");
  }
  return { ...ctx, membership };
}

const CONSOLE_SIGNIN_AUDIT_DEDUP_WINDOW_HOURS = 12;
const CONSOLE_SIGNIN_AUDIT_LOCK_NAMESPACE = 41042;

export async function logConsoleSignIn(identityLinkId: string, organizationId?: string): Promise<void> {
  const dedupSince = new Date(
    Date.now() - CONSOLE_SIGNIN_AUDIT_DEDUP_WINDOW_HOURS * 60 * 60 * 1000,
  );
  await prisma.$transaction(async (tx) => {
    // Serialize sign-in audit writes per identity to avoid duplicate rows under concurrent renders.
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        ${CONSOLE_SIGNIN_AUDIT_LOCK_NAMESPACE}::int,
        hashtext(${identityLinkId}::text)::int
      )
    `;

    const recentSignIn = await tx.consoleAuditLog.findFirst({
      where: {
        actorIdentityId: identityLinkId,
        action: "auth.sign_in",
        createdAt: {
          gte: dedupSince,
        },
      },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    if (recentSignIn) {
      return;
    }

    await tx.consoleAuditLog.create({
      data: {
        organizationId: organizationId ?? null,
        actorIdentityId: identityLinkId,
        action: "auth.sign_in",
        metadata: { surface: "console" },
      },
    });
  });
}

export function isConsoleAuthError(err: unknown): err is ConsoleForbiddenError | { status: number } {
  return (
    err instanceof ConsoleForbiddenError ||
    (typeof err === "object" &&
      err !== null &&
      "status" in err &&
      (err as { status: number }).status === 403)
  );
}
