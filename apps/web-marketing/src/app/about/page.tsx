import type { Metadata } from "next";
import Link from "next/link";

import { AboutPrinciplesGrid } from "@/components/marketing/about/about-principles-grid";
import { AboutSubnav } from "@/components/marketing/about/about-subnav";
import aboutStyles from "@/components/marketing/about/about.module.css";
import { CompanyStack } from "@/components/marketing/company-stack";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { contactUrl } from "@/lib/site-urls";

export const metadata: Metadata = {
  title: "About",
  description: "Salanor builds trust infrastructure for agentic AI — provenance, identity, and liability coverage.",
};

export default function AboutPage() {
  return (
    <>
      <MarketingPage
        label="About"
        title="Salanor Systems"
        lead="We build the platform enterprises need before autonomous agents run in regulated environments — not another agent framework."
        layout="wide"
        backHref="/"
        prefix={<AboutSubnav current="about" />}
      >
        <>
          <p>
            Salanor is a <strong style={{ color: "var(--text)", fontWeight: 500 }}>platform company</strong>{" "}
            for provenance, identity, and liability coverage in production agent systems.
          </p>
          <CompanyStack />
          <p style={{ marginTop: "1.5rem" }}>
            We monetize the managed control plane and open standards — not lock-in on the event format.
            Any auditor can verify APS-1 events with tooling that does not require Salanor to stay online.
          </p>
          <div className={aboutStyles.foundingCard}>
            <p>
              <strong style={{ color: "var(--text)", fontWeight: 500 }}>The founding note</strong> — why we
              started, and what we owe the people downstream of every agent decision.
            </p>
            <Link href="/about/founding">Read the founding note →</Link>
          </div>
          <p>
            <a href={contactUrl()} style={{ color: "var(--teal-bright)", textDecoration: "none" }}>
              Get access →
            </a>{" "}
            for design partners and investors. Console accounts are provisioned after onboarding.
          </p>
        </>
      </MarketingPage>
      <AboutPrinciplesGrid />
    </>
  );
}
