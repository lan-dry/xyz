export const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "http://localhost:3001";

/** Salanor employee workspace (cross-tenant ops). Not for customers. */
export const PLATFORM_URL =
  process.env.NEXT_PUBLIC_PLATFORM_URL ?? "http://localhost:3003";

export const DOCS_BASE_URL =
  process.env.NEXT_PUBLIC_DOCS_BASE_URL ?? "http://localhost:3002";

export function docsUrl(product: "aegis" | "aether" = "aegis"): string {
  const base = DOCS_BASE_URL.replace(/\/$/, "");
  return `${base}/${product}`;
}
