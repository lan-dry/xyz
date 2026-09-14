import { isLocalAuthCookieMode } from "./auth-cookies";

/** True when Auth.js should use the incoming request Host (not AUTH_URL) for actions and redirects. */
export function shouldPreserveAuthRequestOrigin(): boolean {
  if (process.env.AUTH_TRUST_HOST === "false") return false;
  return isLocalAuthCookieMode();
}

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

/** Whether two origins are both loopback dev hosts (localhost + *.localhost). */
export function areLoopbackSiblingOrigins(a: string, b: string): boolean {
  try {
    const hostA = new URL(a).hostname;
    const hostB = new URL(b).hostname;
    return isLoopbackHostname(hostA) && isLoopbackHostname(hostB);
  } catch {
    return false;
  }
}

/**
 * Collapse absolute loopback callback URLs to a same-origin path so Auth.js
 * does not persist a sibling host (e.g. app.aegis.localhost) when signing in on localhost.
 */
export function normalizeLoopbackCallbackUrl(
  callbackUrl: string | undefined,
  _requestHost?: string | null,
): string {
  const fallback = "/app/console/aegis";
  if (!callbackUrl?.trim()) return fallback;
  const trimmed = callbackUrl.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;

  try {
    const target = new URL(trimmed);
    if (!isLoopbackHostname(target.hostname)) {
      return target.pathname + target.search + target.hash || fallback;
    }
    const path = `${target.pathname}${target.search}${target.hash}`;
    return path.startsWith("/") ? path : fallback;
  } catch {
    return trimmed.startsWith("/") ? trimmed : fallback;
  }
}

/** Auth.js redirect callback — keep post-login redirects on the request origin (baseUrl). */
export function resolveSalanorAuthRedirectUrl({
  url,
  baseUrl,
}: {
  url: string;
  baseUrl: string;
}): string {
  if (url.startsWith("/")) return `${baseUrl}${url}`;
  try {
    const target = new URL(url);
    const base = new URL(baseUrl);
    if (target.origin === base.origin) return url;
    if (areLoopbackSiblingOrigins(target.origin, base.origin)) {
      return `${base.origin}${target.pathname}${target.search}${target.hash}`;
    }
  } catch {
    // fall through
  }
  return baseUrl;
}
