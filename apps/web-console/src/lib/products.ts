/** Salanor Console products. Workspace is a separate client-hosted system (not linked here). */
export const PLATFORM_PRODUCTS = [
  {
    slug: "aegis",
    name: "Aegis",
    description: "Agent liability and proof infrastructure",
    href: "/aegis",
    external: false,
    status: "active" as const,
  },
  {
    slug: "insurance",
    name: "Insurance",
    description: "Risk metrics and reinsurance bridge (preview, not GA)",
    href: "/insurance",
    external: false,
    /** Hidden in nav until insurance-api is connected — do not show an empty preview. */
    status: "hidden" as const,
  },
] as const;

export type ProductSlug = (typeof PLATFORM_PRODUCTS)[number]["slug"];

/** Products shown in the console / platform switcher (active only). */
export const VISIBLE_PLATFORM_PRODUCTS = PLATFORM_PRODUCTS.filter(
  (p) => p.status === "active",
);
