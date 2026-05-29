import type { Metadata } from "next";

import { MarketingPage } from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "Terms",
};

export default function TermsPage() {
  return (
    <MarketingPage label="Legal" title="Terms of Service" layout="narrow" backHref="/">
      <p>Terms placeholder. Legal copy to be finalized before GA.</p>
    </MarketingPage>
  );
}
