import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";

import {
  getInternalRoleForEmail,
  isAllowedAdminEmail,
  maybeBootstrapInternalUser,
  resolveSignInEmail,
} from "./admin";
import { isAllowedProductSignIn } from "./console";
import type { AuthUserSuspendedRow, SalanorAuthPrisma } from "./prisma-types";
import { salanorAuthConfig } from "./auth-config";
import { resolveAuthRouteHandlers } from "./auth-handlers";
import { salanorAuthProviders } from "./providers";
import "./types";

async function isPlatformSuspended(
  prisma: SalanorAuthPrisma,
  email: string | null | undefined,
): Promise<boolean> {
  if (!email?.trim()) return false;
  const row = (await prisma.user
    .findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { platformSuspendedAt: true },
    })
    .catch(() => null)) as AuthUserSuspendedRow | null;
  return Boolean(row?.platformSuspendedAt);
}

async function isPlatformSuspendedByUserId(
  prisma: SalanorAuthPrisma,
  userId: string,
): Promise<boolean> {
  const row = (await prisma.user
    .findUnique({
      where: { id: userId },
      select: { platformSuspendedAt: true },
    })
    .catch(() => null)) as AuthUserSuspendedRow | null;
  return Boolean(row?.platformSuspendedAt);
}

export function createSalanorAuth(prisma: SalanorAuthPrisma) {
  const authOptions = {
    ...salanorAuthConfig,
    providers: salanorAuthProviders(),
    secret: process.env.AUTH_SECRET,
    // Apps pass root-generated PrismaClient; cast avoids auth depending on generate output.
    adapter: PrismaAdapter(prisma as never),
    callbacks: {
      ...salanorAuthConfig.callbacks,
      async signIn({ user, profile }) {
        const email = resolveSignInEmail(user, profile);
        if (!email) return false;
        if (await isPlatformSuspended(prisma, email)) return false;
        await maybeBootstrapInternalUser(email, prisma as never);
        return isAllowedProductSignIn(prisma, email, (e) => isAllowedAdminEmail(e, prisma));
      },
      async jwt({ token, user }) {
        if (user?.id) {
          token.sub = user.id;
          const email = user.email?.trim().toLowerCase() ?? null;
          token.role = email ? await getInternalRoleForEmail(email, prisma) : null;
          const totp = (await prisma.user
            .findUnique({
              where: { id: user.id },
              select: { totpEnabledAt: true, platformSuspendedAt: true },
            })
            .catch(() => null)) as { totpEnabledAt?: Date | null; platformSuspendedAt?: Date | null } | null;
          const totpEnabled = Boolean(totp?.totpEnabledAt);
          token.totpEnabled = totpEnabled;
          token.totpVerified = !totpEnabled;
          token.accessBlocked = Boolean(totp?.platformSuspendedAt);
        }
        return token;
      },
      async session({ session, token }) {
        if (session.user && token.sub) {
          session.user.id = token.sub;
          session.user.role = (token.role as string | null | undefined) ?? null;
          session.user.totpEnabled = Boolean(token.totpEnabled);
          session.user.totpVerified = token.totpVerified !== false;

          const suspended =
            (await isPlatformSuspendedByUserId(prisma, token.sub)) || Boolean(token.accessBlocked);
          session.user.accessBlocked = suspended;
        }
        return session;
      },
    },
  } satisfies Parameters<typeof NextAuth>[0];

  const { auth, handlers: defaultHandlers, signIn, signOut } = NextAuth(authOptions);
  const handlers = resolveAuthRouteHandlers(authOptions, defaultHandlers);

  return { auth, handlers, signIn, signOut };
}
