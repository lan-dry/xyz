import type { Metadata } from "next";

import { ProductPageContent } from "@/components/marketing/sections/product-page";
import { PRODUCTS } from "@/lib/marketing-content";

export const metadata: Metadata = {
  title: "Aegis · Agent provenance by Salanor",
  description:
    "Salanor Aegis: cryptographically signed provenance for every AI agent action. APS-1 ledger, policy enforcement, and compliance exports.",
  openGraph: {
    title: "Aegis · Agent provenance by Salanor",
    description:
      "Salanor Aegis: cryptographically signed provenance for every AI agent action. APS-1 ledger, policy enforcement, and compliance exports.",
    url: "/products/aegis",
  },
  alternates: {
    canonical: "/products/aegis",
  },
};

export default function AegisProductPage() {
  return <ProductPageContent product={PRODUCTS.aegis} />;
}
