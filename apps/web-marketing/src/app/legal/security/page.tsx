import type { Metadata } from "next";
import Link from "next/link";

import { LegalMeta, LegalProse, LegalSection } from "@/components/marketing/legal-prose";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { BRAND } from "@/lib/marketing-content";

export const metadata: Metadata = {
  title: "Security",
  description: `Security disclosure and contact for ${BRAND.taglineShort}.`,
};

export default function SecurityPage() {
  return (
    <MarketingPage
      label="Legal"
      title="Security"
      layout="narrow"
      backHref="/"
      lead="How to report vulnerabilities and what we protect in the Aegis platform."
    >
      <LegalProse>
        <LegalMeta>
          <strong>Last updated:</strong> 1 June 2026 ·{" "}
          <a href="/.well-known/security.txt">security.txt</a> ·{" "}
          <a href="mailto:security@salanor.com">security@salanor.com</a>
        </LegalMeta>

        <p>
          {BRAND.company} builds {BRAND.product} as a signed provenance layer for production AI
          agents. We treat security reports from customers and researchers as part of operating
          the product, not as a distraction.
        </p>

        <LegalSection title="Report a vulnerability">
          <p>
            Email{" "}
            <a href="mailto:security@salanor.com">security@salanor.com</a> with:
          </p>
          <ul>
            <li>A clear description and impact assessment</li>
            <li>Steps to reproduce on the latest production or stated pilot environment</li>
            <li>Your preferred contact and disclosure timeline</li>
          </ul>
          <p>
            For coordination without exposing details in email, use the{" "}
            <Link href="/contact">contact form</Link> with topic <strong>Security disclosure</strong>{" "}
            and ask for encrypted follow-up.
          </p>
          <p>
            Automated tools should read{" "}
            <a href="/.well-known/security.txt">/.well-known/security.txt</a> (RFC 9116).
          </p>
        </LegalSection>

        <LegalSection title="What we protect">
          <ul>
            <li>
              <strong>Integrity of APS-1 events</strong> — Ed25519 signatures, per-agent hash chains,
              and optional Merkle transparency proofs
            </li>
            <li>
              <strong>Tenant isolation</strong> — organization-scoped data paths in API and console
            </li>
            <li>
              <strong>Authentication</strong> — password hashing, session cookies, OAuth and
              enterprise SSO where enabled
            </li>
            <li>
              <strong>Operational access</strong> — Platform Ops actions audited; production access
              on a least-privilege basis
            </li>
          </ul>
        </LegalSection>

        <LegalSection title="Out of scope">
          <p>
            Clickjacking on marketing pages without demonstrated impact, missing security headers
            without exploit, and social engineering are generally out of scope. Do not test against
            customer tenants you do not own.
          </p>
        </LegalSection>

        <LegalSection title="Safe harbor">
          <p>
            We will not pursue legal action against researchers who act in good faith, avoid privacy
            violations and service disruption, and give us reasonable time to remediate before public
            disclosure. We do not operate a paid bug-bounty program during the design-partner phase;
            we acknowledge valid reports within five business days when possible.
          </p>
        </LegalSection>
      </LegalProse>
    </MarketingPage>
  );
}
