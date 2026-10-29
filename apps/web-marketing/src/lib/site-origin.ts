/** Canonical marketing origin (www). Used for sitemap, metadataBase, and JSON-LD. */
export function resolveSiteOrigin(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.PUBLIC_SITE_URL?.trim() ||
    process.env.VERCEL_URL?.trim();

  if (fromEnv) {
    const withScheme = fromEnv.startsWith("http") ? fromEnv : `https://${fromEnv}`;
    const normalized = withScheme.replace(/\/$/, "");
    const isProduction =
      process.env.VERCEL_ENV === "production" ||
      process.env.NODE_ENV === "production";
    try {
      const hostname = new URL(normalized).hostname.toLowerCase();
      const isLocal =
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1";
      if (!(isProduction && isLocal)) {
        return normalized;
      }
    } catch {
      // Invalid configuration falls through to the canonical public origin.
    }
  }

  return "https://www.salanor.com";
}

export const SITE_ORIGIN = resolveSiteOrigin();

/** List-unsubscribe and campaign footers must be HTTPS for Gmail/Yahoo (RFC 8058). */
export function newsletterPublicOrigin(): string {
  const origin = resolveSiteOrigin();
  if (origin.startsWith("https://")) return origin;
  if (process.env.NODE_ENV === "development") {
    return origin.replace(/^http:\/\//, "https://");
  }
  return "https://www.salanor.com";
}
