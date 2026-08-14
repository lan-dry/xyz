import type { Metadata } from "next";
import Link from "next/link";

import { MarketingPage } from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "Careers",
  description: "Join Salanor. Build provenance and audit systems for production agents.",
};

export default function CareersPage() {
  return (
    <MarketingPage
      label="Careers"
      title="Open roles"
      lead="We hire senior engineers across platform, cryptography, and developer experience."
    >
      <p>
        Open roles will be posted here. For now, send your portfolio and a short note on what you would
        own to{" "}
        <a href="mailto:careers@salanor.com" style={{ color: "var(--teal-bright)" }}>
          careers@salanor.com
        </a>
        , or use the{" "}
        <Link href="/contact" style={{ color: "var(--teal-bright)", textDecoration: "none" }}>
          contact form
        </Link>{" "}
        with topic Careers.
      </p>
    </MarketingPage>
  );
}
