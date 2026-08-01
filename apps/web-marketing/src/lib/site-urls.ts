/** Console app (app.salanor.com). */
export const CONSOLE_URL =
  process.env.NEXT_PUBLIC_CONSOLE_URL ??
  (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production"
    ? "https://app.salanor.com"
    : "http://localhost:3000");

/**
 * Marketing site origin (used when linking *to* marketing from other apps).
 * Prefer relative paths for in-app marketing CTAs so missing env never points at localhost.
 */
export const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production"
    ? "https://www.salanor.com"
    : "http://localhost:3001");

/**
 * Docs app base (docs.salanor.com locally on :3002).
 * Product paths: /aegis, /aether, etc.
 */
export const DOCS_BASE_URL =
  process.env.NEXT_PUBLIC_DOCS_BASE_URL ?? "https://docs.salanor.com";

export type DocsProduct = "aegis" | "aether";

export function docsUrl(product: DocsProduct = "aegis"): string {
  const base = DOCS_BASE_URL.replace(/\/$/, "");
  return `${base}/${product}`;
}

/** @deprecated Use docsUrl("aegis") */
export const DOCS_URL = docsUrl("aegis");

export const CONTACT_PATH = "/contact";

/** Same-origin contact CTA; always relative so production never falls back to localhost. */
export function contactUrl(): string {
  return CONTACT_PATH;
}

/** Default console entry: signed-in users to the app; others to login via layout. */
export function consoleAppUrl(path = "/aegis/traces"): string {
  return `${CONSOLE_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export function consoleLoginUrl(returnTo?: string): string {
  const base = `${CONSOLE_URL.replace(/\/$/, "")}/login`;
  if (!returnTo) return base;
  return `${base}?return=${encodeURIComponent(returnTo)}`;
}

/** Public Merkle inclusion verifier (no login). */
export function publicVerifyUrl(org?: string, eventId?: string): string {
  const base = `${CONSOLE_URL.replace(/\/$/, "")}/verify`;
  if (!org && !eventId) return base;
  const params = new URLSearchParams();
  if (org) params.set("org", org);
  if (eventId) params.set("event", eventId);
  return `${base}?${params.toString()}`;
}
