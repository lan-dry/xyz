import { isLocalAuthCookieMode, resolveDevAuthCookieDomain } from "./auth-cookies";

/** Ensures Auth.js Set-Cookie headers use `.localhost` in local dev (some paths omit domain). */
export function ensureAuthSetCookieDomain(raw: string, domain: string): string {
  let cookie = raw;
  if (/;\s*Domain=/i.test(cookie)) {
    cookie = cookie.replace(/;\s*Domain=[^;]*/i, `; Domain=${domain}`);
  } else {
    cookie = `${cookie}; Domain=${domain}`;
  }
  if (isLocalAuthCookieMode()) {
    cookie = cookie.replace(/;\s*Secure\b/gi, "");
    if (!/;\s*SameSite=/i.test(cookie)) {
      cookie = `${cookie}; SameSite=Lax`;
    }
    if (!/;\s*Path=/i.test(cookie)) {
      cookie = `${cookie}; Path=/`;
    }
  }
  return cookie;
}

/** Patch response Set-Cookie headers so session is shared across localhost + `*.localhost`. */
export function patchAuthResponseSetCookieDomain(response: Response): Response {
  const domain = resolveDevAuthCookieDomain();
  if (!domain) return response;

  const setCookies =
    typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  if (setCookies.length === 0) return response;

  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  for (const raw of setCookies) {
    headers.append("set-cookie", ensureAuthSetCookieDomain(raw, domain));
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
