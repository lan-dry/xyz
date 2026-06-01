import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { salanorAuthConfig } from "@salanor/auth/auth-config";
import { TOTP_CHALLENGE_COOKIE_NAME, validateTotpChallengeCookie } from "@/lib/totp/challenge-cookie";
import { isAppSurfacePath, isConsoleAegisPath } from "@/lib/app-paths";
import { handleHostRouting } from "@/lib/host-routing";

const { auth } = NextAuth({
  ...salanorAuthConfig,
  secret: process.env.AUTH_SECRET,
});

export default auth(async (req) => {
  const hostRouting = handleHostRouting(req);
  if (hostRouting) return hostRouting;

  const { pathname } = req.nextUrl;
  const legacyConsole =
    pathname === "/console" || pathname.startsWith("/console/");
  if ((pathname.startsWith("/admin") || isConsoleAegisPath(pathname) || legacyConsole) && !req.auth) {
    const signIn = new URL("/sign-in", req.nextUrl.origin);
    signIn.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signIn);
  }

  const user = req.auth?.user;
  if (user?.accessBlocked && (isAppSurfacePath(pathname) || legacyConsole)) {
    const signIn = new URL("/sign-in", req.nextUrl.origin);
    signIn.searchParams.set("error", "Suspended");
    signIn.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signIn);
  }

  const protectsAppSurface = isAppSurfacePath(pathname) || legacyConsole;
  if (protectsAppSurface && user?.id && user.totpEnabled && user.totpVerified === false) {
    const cookie = req.cookies.get(TOTP_CHALLENGE_COOKIE_NAME)?.value;
    if (!(await validateTotpChallengeCookie(cookie, user.id))) {
      const totp = new URL("/sign-in/totp", req.nextUrl.origin);
      totp.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(totp);
    }
  }
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
