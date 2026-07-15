import type { Metadata } from "next";

import { ProductPageContent } from "@/components/marketing/sections/product-page";
import { BRAND, PRODUCTS } from "@/lib/marketing-content";

export const metadata: Metadata = {
  title: "Aegis",
  description: BRAND.taglineFull,
};

export default function AegisProductPage() {
  return <ProductPageContent product={PRODUCTS.aegis} />;
}
