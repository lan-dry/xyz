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
    status: "preview" as const,
  },
] as const;

export type ProductSlug = (typeof PLATFORM_PRODUCTS)[number]["slug"];
