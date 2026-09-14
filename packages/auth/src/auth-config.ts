import type { NextAuthConfig } from "next-auth";

import { isLocalAuthCookieMode, salanorDevAuthCookies } from "./auth-cookies";
import { resolveSalanorAuthRedirectUrl } from "./auth-request-origin";

/**
 * Edge-safe Auth.js config (middleware). No Prisma or nodemailer.
 * `providers: []` is required — Auth.js calls `providers.map()` in setEnvDefaults.
 * Real providers are set in `createSalanorAuth` for Node route handlers.
 */
export const salanorAuthConfig = {
  providers: [],
  pages: {
    signIn: "/sign-in",
    /** Avoid generic `/api/auth/error` — surface allowlist failures on the app sign-in page. */
    error: "/sign-in",
  },
  session: {
    strategy: "jwt",
  },
  /** Required for http://localhost and http://*.localhost (Auth.js defaults secure cookies in production). */
  useSecureCookies: isLocalAuthCookieMode() ? false : undefined,
  get cookies() {
    return salanorDevAuthCookies();
  },
  callbacks: {
    redirect: resolveSalanorAuthRedirectUrl,
    async session({ session, token }) {
      if (session.user) {
        session.user.role = (token.role as string | null | undefined) ?? null;
        session.user.totpEnabled = Boolean(token.totpEnabled);
        session.user.totpVerified = token.totpVerified !== false;
        session.user.accessBlocked = Boolean(token.accessBlocked);
      }
      return session;
    },
  },
  /** Honor request Host for magic-link callbacks (app.aegis.localhost vs localhost). */
  trustHost: process.env.AUTH_TRUST_HOST !== "false",
} satisfies NextAuthConfig;
