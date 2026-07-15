import type { NextAuthConfig } from "next-auth";

function authBaseHostname(): string | null {
  const raw = process.env.AUTH_URL?.trim() || process.env.NEXTAUTH_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

function isLoopbackAuthBase(): boolean {
  const host = authBaseHostname();
  if (!host) return false;
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
}

/** True when session cookies should be shared across localhost + `*.localhost`. */
export function isLocalAuthCookieMode(): boolean {
  const explicit = process.env.AUTH_COOKIE_DOMAIN?.trim();
  if (explicit === "none" || explicit === "off") return false;
  if (process.env.NODE_ENV === "development") return true;
  if (process.env.SALANOR_ENV?.trim() === "local") return true;
  return isLoopbackAuthBase();
}

/** Cookie domain for sharing Auth.js session across `*.localhost` in local dev. */
export function resolveDevAuthCookieDomain(): string | undefined {
  if (!isLocalAuthCookieMode()) return undefined;
  const explicit = process.env.AUTH_COOKIE_DOMAIN?.trim();
  if (explicit === "none" || explicit === "off") return undefined;
  return explicit || ".localhost";
}

/** Auth.js cookie overrides for multi-subdomain local dev (console + marketing hosts). */
export function salanorDevAuthCookies(): NextAuthConfig["cookies"] | undefined {
  const domain = resolveDevAuthCookieDomain();
  if (!domain) return undefined;

  const options = {
    domain,
    path: "/",
    secure: false,
    sameSite: "lax" as const,
  };

  return {
    sessionToken: { options },
    callbackUrl: { options },
    csrfToken: { options },
    pkceCodeVerifier: { options },
    state: { options },
    nonce: { options },
    webAuthnChallenge: { options },
  };
}
