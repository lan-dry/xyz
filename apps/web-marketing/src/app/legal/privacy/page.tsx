import type { Metadata } from "next";
import Link from "next/link";

import { LegalMeta, LegalProse, LegalSection } from "@/components/marketing/legal-prose";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { BRAND } from "@/lib/marketing-content";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Salanor collects and uses personal data on salanor.com and the Aegis console.",
};

export default function PrivacyPage() {
  return (
    <MarketingPage
      label="Legal"
      title="Privacy Policy"
      layout="narrow"
      backHref="/"
      lead="How we handle personal information when you use our website, contact us, or participate in an Aegis design partner pilot."
    >
      <LegalProse>
        <LegalMeta>
          <strong>Effective date:</strong> 1 June 2026 · <strong>Controller:</strong> Salanor Systems,
          Inc. · Questions:{" "}
          <a href="mailto:hello@salanor.com">hello@salanor.com</a>
        </LegalMeta>

        <LegalSection title="1. Scope">
          <p>
            This policy describes how Salanor Systems, Inc. (&quot;Salanor,&quot; &quot;we,&quot;
            &quot;us&quot;) processes personal data when you:
          </p>
          <ul>
            <li>Visit salanor.com and related marketing pages</li>
            <li>Submit the contact or design-partner forms</li>
            <li>Sign in to the Aegis console or Salanor Platform Ops (pilot environments)</li>
            <li>Use the {BRAND.product} API and SDKs as a customer or design partner</li>
          </ul>
          <p>
            Customer agreements and data processing addenda (DPAs) govern production tenant data
            once you sign an order form. This page is the baseline notice for our public surfaces.
          </p>
        </LegalSection>

        <LegalSection title="2. Data we collect">
          <p>
            <strong>Website and contact.</strong> Name, work email, organization, message content,
            and technical metadata (hashed IP address, page path, timestamp) when you use the contact
            form.
          </p>
          <p>
            <strong>Console accounts.</strong> Email address, display name, password hash (never
            stored in plain text), organization membership, role, session identifiers, and audit
            events related to sign-in and administration.
          </p>
          <p>
            <strong>Aegis product data.</strong> Metadata about agent actions (APS-1 events),
            policy decisions, trace identifiers, and optional redacted tool arguments. Signing keys
            for events remain under your control (bring-your-own-key). We do not require raw model
            prompts in the default configuration.
          </p>
          <p>
            <strong>Support and email.</strong> If you correspond with us, we retain the content
            needed to respond.
          </p>
        </LegalSection>

        <LegalSection title="3. How we use data">
          <ul>
            <li>Operate, secure, and improve the website and services</li>
            <li>Respond to sales, support, and security reports</li>
            <li>Provide the Aegis ledger, console, exports, and APIs you configure</li>
            <li>Meet legal obligations and enforce our terms</li>
          </ul>
          <p>
            We do not sell personal information. We do not use contact form data for unrelated
            advertising lists.
          </p>
        </LegalSection>

        <LegalSection title="4. Legal bases (EEA/UK visitors)">
          <p>Where GDPR applies, we rely on:</p>
          <ul>
            <li>
              <strong>Contract</strong> — providing services you request or evaluate under a pilot
            </li>
            <li>
              <strong>Legitimate interests</strong> — securing our platform, preventing abuse, and
              communicating about your account
            </li>
            <li>
              <strong>Consent</strong> — where required (e.g. optional marketing updates you opt into)
            </li>
            <li>
              <strong>Legal obligation</strong> — when law requires retention or disclosure
            </li>
          </ul>
        </LegalSection>

        <LegalSection title="5. Processors and hosting">
          <p>
            We use infrastructure providers (for example cloud hosting, Postgres, email delivery,
            and observability) under written terms that require appropriate safeguards. A current
            sub-processor list is available on request for customers under NDA or DPA.
          </p>
          <p>
            Production regions and exact vendors are listed in customer documentation during onboarding.
          </p>
        </LegalSection>

        <LegalSection title="6. Retention">
          <ul>
            <li>Contact submissions: retained while relevant to active conversations, then archived or deleted</li>
            <li>Console audit and APS-1 events: per your plan retention settings (pilot defaults documented at onboarding)</li>
            <li>Session logs: short operational window unless needed for security investigation</li>
          </ul>
        </LegalSection>

        <LegalSection title="7. Security">
          <p>
            We use encryption in transit, access controls, tenant isolation, and signed event
            verification in the product. Report issues to{" "}
            <a href="mailto:security@salanor.com">security@salanor.com</a> or see our{" "}
            <Link href="/legal/security">security page</Link> and{" "}
            <a href="/.well-known/security.txt">security.txt</a>.
          </p>
        </LegalSection>

        <LegalSection title="8. Your rights">
          <p>
            Depending on your location, you may request access, correction, deletion, restriction,
            or portability of personal data we control. Contact{" "}
            <a href="mailto:hello@salanor.com">hello@salanor.com</a>. We will verify your request
            before acting. You may lodge a complaint with your local supervisory authority.
          </p>
        </LegalSection>

        <LegalSection title="9. International transfers">
          <p>
            If we transfer data outside your country, we use appropriate safeguards (such as
            standard contractual clauses) where required by law.
          </p>
        </LegalSection>

        <LegalSection title="10. Changes">
          <p>
            We will post updates on this page and adjust the effective date. Material changes to
            customer processing will be communicated through your account team or agreement.
          </p>
        </LegalSection>
      </LegalProse>
    </MarketingPage>
  );
}
