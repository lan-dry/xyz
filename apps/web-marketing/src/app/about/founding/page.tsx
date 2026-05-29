import type { Metadata } from "next";
import Link from "next/link";

import { AboutSubnav } from "@/components/marketing/about/about-subnav";
import { FoundingSidebar } from "@/components/marketing/about/founding-sidebar";
import { ScrollReveal } from "@/components/marketing/scroll-reveal";
import pageStyles from "@/components/marketing/marketing-page.module.css";
import aboutStyles from "@/components/marketing/about/about.module.css";
import { FOUNDING_PULL_QUOTE } from "@/lib/marketing-content";


export const metadata: Metadata = {
  title: "The founding note",
  description:
    "Why Salanor exists — receipts, accountability, and infrastructure for high-stakes AI decisions.",
};

export default function FoundingPage() {
  return (
    <section className={pageStyles.page}>
      <ScrollReveal>
        <div className={pageStyles.inner}>
          <AboutSubnav current="founding" />
          <p className="section-label">The founding note</p>
          <div className={aboutStyles.foundingLayout}>
            <article>
              <h1 className={aboutStyles.foundingHeadline}>{FOUNDING_PULL_QUOTE}</h1>
              <div className={aboutStyles.foundingBody}>
                <p>
                  In 2024, a friend was denied a loan by a model no one could explain. Not because
                  the model was wrong — because no one could show their work. The bank had a
                  score; the applicant had a life. There was no bridge between them, and no
                  infrastructure for being careful.
                </p>
                <p>
                  That gap is what we are building. When AI ships into loans, triage, surveillance,
                  and every other high-stakes corner of the economy, someone has to ensure the
                  decisions can be reconstructed, challenged, and reasoned about — not just
                  predicted.
                </p>
                <p>
                  Salanor is the platform company.{" "}
                  <Link href="/products/aegis" style={{ color: "var(--teal-bright)", textDecoration: "none" }}>
                    Aegis
                  </Link>{" "}
                  is provenance and audit for production agents.{" "}
                  <Link href="/products/aether" style={{ color: "var(--teal-bright)", textDecoration: "none" }}>
                    Aether
                  </Link>{" "}
                  is the intelligence layer — in research for 2027, on the same APS-1 ledger. We are
                  funded to outlast the hype cycle, not to ride it.
                </p>
              </div>
              <p className={aboutStyles.foundingSign}>— The founding team</p>
              <div className={aboutStyles.foundingCard}>
                <p>
                  Operating principles and how we work with design partners live on the company
                  About page.
                </p>
                <Link href="/about">About Salanor →</Link>
              </div>
              <Link href="/about" className={pageStyles.back}>
                ← Back to About
              </Link>
            </article>
            <FoundingSidebar />
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
