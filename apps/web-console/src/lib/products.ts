/** Salanor platform products (Stage 11: single monorepo, multiple routes). */
export const PLATFORM_PRODUCTS = [
  {
    slug: "aegis",
    name: "Aegis",
    description: "Agent liability and proof infrastructure",
    href: "/aegis",
    status: "active" as const,
  },
  {
    slug: "insurance",
    name: "Insurance",
    description: "Risk metrics and reinsurance bridge (preview — not GA)",
    href: "/insurance",
    status: "preview" as const,
  },
] as const;

export type ProductSlug = (typeof PLATFORM_PRODUCTS)[number]["slug"];
