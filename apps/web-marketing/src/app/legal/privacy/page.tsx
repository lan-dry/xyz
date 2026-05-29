import type { Metadata } from "next";

import { MarketingPage } from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "Privacy",
};

export default function PrivacyPage() {
  return (
    <MarketingPage label="Legal" title="Privacy Policy" layout="narrow" backHref="/">
      <p>Privacy policy placeholder. Legal copy to be finalized before GA.</p>
    </MarketingPage>
  );
}
