import type { Metadata } from "next";

import { MarketingPage } from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "Security",
};

export default function SecurityPage() {
  return (
    <MarketingPage label="Legal" title="Security" layout="narrow" backHref="/">
      <p>
        Responsible disclosure:{" "}
        <a href="mailto:security@salanor.com" style={{ color: "var(--teal-bright)" }}>
          security@salanor.com
        </a>
        . Use the contact form with topic Security disclosure for encrypted follow-up coordination.
      </p>
    </MarketingPage>
  );
}
