/**
 * Normalize Postgres URLs for node-pg (Windows localhost, Neon sslmode warning).
 */
export function normalizePostgresDatabaseUrl(raw: string): string {
  let url = raw.trim();
  url = url.replace(/@localhost([:/])/gi, "@127.0.0.1$1");

  // pg v8 treats require/prefer/verify-ca as verify-full; set explicitly to silence warnings.
  if (/([?&])sslmode=(require|prefer|verify-ca)(&|$)/i.test(url)) {
    url = url.replace(
      /([?&])sslmode=(require|prefer|verify-ca)/gi,
      "$1sslmode=verify-full",
    );
  }

  return url;
}
