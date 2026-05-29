/** Internal + dev URL prefix for the Attest tenant console (Pattern C). */
export const CONSOLE_ATTEST_BASE = "/app/console/attest";

/** Internal + dev URL prefix for Attest documentation. */
export const DOCS_ATTEST_BASE = "/docs/attest";

/** Public path on the app host in production (no `/app` prefix). */
export const CONSOLE_ATTEST_PUBLIC_PREFIX = "/console/attest";

/** Public path on the docs host in production. */
export const DOCS_ATTEST_PUBLIC_PREFIX = "/attest";

export function consoleAttestPath(suffix = ""): string {
  if (!suffix || suffix === "/") return CONSOLE_ATTEST_BASE;
  const normalized = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `${CONSOLE_ATTEST_BASE}${normalized}`;
}

export function docsAttestPath(suffix = ""): string {
  if (!suffix || suffix === "/") return DOCS_ATTEST_BASE;
  const normalized = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `${DOCS_ATTEST_BASE}${normalized}`;
}

export function isConsoleAttestPath(pathname: string): boolean {
  return (
    pathname === CONSOLE_ATTEST_BASE ||
    pathname.startsWith(`${CONSOLE_ATTEST_BASE}/`)
  );
}

export function isDocsAttestPath(pathname: string): boolean {
  return pathname === DOCS_ATTEST_BASE || pathname.startsWith(`${DOCS_ATTEST_BASE}/`);
}

export function isAppSurfacePath(pathname: string): boolean {
  return (
    pathname.startsWith("/admin") ||
    isConsoleAttestPath(pathname) ||
    pathname.startsWith("/api/console") ||
    pathname.startsWith("/api/admin")
  );
}
