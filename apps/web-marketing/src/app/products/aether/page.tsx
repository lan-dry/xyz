import type { Metadata } from "next";

import { ProductPageContent } from "@/components/marketing/sections/product-page";
import { PRODUCTS } from "@/lib/marketing-content";

export const metadata: Metadata = {
  title: "Aether",
  description: PRODUCTS.aether.subhead,
};

export default function AetherProductPage() {
  return <ProductPageContent product={PRODUCTS.aether} />;
}
