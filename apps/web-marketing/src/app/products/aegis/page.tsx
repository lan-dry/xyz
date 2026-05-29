import type { Metadata } from "next";

import { ProductPageContent } from "@/components/marketing/sections/product-page";
import { PRODUCTS } from "@/lib/marketing-content";

export const metadata: Metadata = {
  title: "Aegis",
  description: PRODUCTS.aegis.subhead,
};

export default function AegisProductPage() {
  return <ProductPageContent product={PRODUCTS.aegis} />;
}
