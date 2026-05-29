import type { Metadata } from "next";

import { MarketingPage } from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "Blog",
};

export default function BlogPage() {
  return (
    <MarketingPage
      label="Blog"
      title="Research & updates"
      lead="Notes on APS-1, agent liability, and platform releases — coming soon."
    >
      <p>Subscribe via the contact form if you want early posts on provenance and compliance engineering.</p>
    </MarketingPage>
  );
}
