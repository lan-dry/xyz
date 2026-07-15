/**
 * Customer-facing docs URLs. Always production defaults.
 *
 * Do NOT use NEXT_PUBLIC_AEGIS_API_URL / NEXT_PUBLIC_CONSOLE_URL here — those
 * are for web-console local dev and would leak 127.0.0.1 into customer docs.
 *
 * Salanor staff: set NEXT_PUBLIC_DOCS_API_URL / NEXT_PUBLIC_DOCS_CONSOLE_URL
 * only when intentionally previewing docs with local stack URLs.
 */

export const DOCS = {
  title: "Salanor Docs",
  npmPackage: "@salanor/aegis",
  /** Customer console (signup, API keys, traces). */
  consoleUrl:
    process.env.NEXT_PUBLIC_DOCS_CONSOLE_URL?.trim() || "https://console.salanor.com",
  /** Marketing site */
  marketingUrl:
    process.env.NEXT_PUBLIC_DOCS_MARKETING_URL?.trim() || "https://salanor.com",
  /** Ingest + policy API base (no path suffix). */
  apiBaseUrl:
    process.env.NEXT_PUBLIC_DOCS_API_URL?.trim() || "https://api.salanor.com",
  apiIngestPath: "/v1/aegis",
  apiPublicPath: "/v1/public",
} as const;
