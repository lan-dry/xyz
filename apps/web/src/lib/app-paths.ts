/** Internal + dev URL prefix for the Aegis tenant console (Pattern C). */
export const CONSOLE_AEGIS_BASE = "/app/console/aegis";

/** Internal + dev URL prefix for Aegis documentation. */
export const DOCS_AEGIS_BASE = "/docs/aegis";

/** Public path on the app host in production (no `/app` prefix). */
export const CONSOLE_AEGIS_PUBLIC_PREFIX = "/console/aegis";

/** Public path on the docs host in production. */
export const DOCS_AEGIS_PUBLIC_PREFIX = "/aegis";

export function consoleAegisPath(suffix = ""): string {
  if (!suffix || suffix === "/") return CONSOLE_AEGIS_BASE;
  const normalized = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `${CONSOLE_AEGIS_BASE}${normalized}`;
}

export function docsAegisPath(suffix = ""): string {
  if (!suffix || suffix === "/") return DOCS_AEGIS_BASE;
  const normalized = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `${DOCS_AEGIS_BASE}${normalized}`;
}

export function isConsoleAegisPath(pathname: string): boolean {
  return (
    pathname === CONSOLE_AEGIS_BASE ||
    pathname.startsWith(`${CONSOLE_AEGIS_BASE}/`)
  );
}

export function isDocsAegisPath(pathname: string): boolean {
  return pathname === DOCS_AEGIS_BASE || pathname.startsWith(`${DOCS_AEGIS_BASE}/`);
}

export function isAppSurfacePath(pathname: string): boolean {
  return (
    pathname.startsWith("/admin") ||
    isConsoleAegisPath(pathname) ||
    pathname.startsWith("/api/console") ||
    pathname.startsWith("/api/admin")
  );
}
