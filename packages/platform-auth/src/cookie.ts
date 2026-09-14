/** Shared session cookie options for Salanor ID and product APIs. */
export function sessionCookieOptions(maxAgeSeconds: number) {
  const domain = process.env.SESSION_COOKIE_DOMAIN?.trim();
  const isProd = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "Lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
    ...(domain ? { domain } : {}),
  };
}
