import type { Metadata } from "next";
import Link from "next/link";

import { LegalMeta, LegalProse, LegalSection } from "@/components/marketing/legal-prose";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { BRAND } from "@/lib/marketing-content";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms governing use of salanor.com and Salanor pilot services.",
};

export default function TermsPage() {
  return (
    <MarketingPage
      label="Legal"
      title="Terms of Service"
      layout="narrow"
      backHref="/"
      lead="Rules for using our website and participating in early access to Salanor products."
    >
      <LegalProse>
        <LegalMeta>
          <strong>Effective date:</strong> 1 June 2026 · <strong>Entity:</strong> Salanor Systems,
          Inc. · <strong>Contact:</strong>{" "}
          <a href="mailto:hello@salanor.com">hello@salanor.com</a>
        </LegalMeta>

        <LegalSection title="1. Agreement">
          <p>
            By accessing salanor.com, creating an account, or using {BRAND.product} or related
            Salanor services (collectively, the &quot;Services&quot;), you agree to these Terms. If
            you use the Services on behalf of an organization, you represent that you have authority
            to bind that organization.
          </p>
          <p>
            A separate order form, design-partner letter, or master services agreement prevails if
            it conflicts with these Terms on commercial points (fees, SLA, data processing).
          </p>
        </LegalSection>

        <LegalSection title="2. The Services">
          <p>
            {BRAND.taglineFull} Salanor provides software for recording, verifying, and exporting
            provenance of AI agent actions. Features vary by plan and phase. Pilot and beta
            features may change, break, or be withdrawn with notice where practical.
          </p>
          <p>
            Open specifications (such as APS-1) and SDKs may be offered under separate open-source
            licenses. Managed hosting, console, and APIs are governed by these Terms unless stated
            otherwise.
          </p>
        </LegalSection>

        <LegalSection title="3. Accounts and acceptable use">
          <p>You agree to:</p>
          <ul>
            <li>Provide accurate registration information and keep credentials confidential</li>
            <li>Use the Services only for lawful purposes and in line with applicable export and sanctions rules</li>
            <li>Not probe or disrupt our systems except through our published security program</li>
            <li>Not misuse another tenant&apos;s data or attempt to bypass access controls</li>
          </ul>
          <p>
            We may suspend access for risk, non-payment (when applicable), or material breach.
          </p>
        </LegalSection>

        <LegalSection title="4. Customer data and keys">
          <p>
            You retain ownership of data you submit. You grant Salanor the rights necessary to
            host, process, and display that data to provide the Services. You are responsible for
            configuring retention, access roles, and signing keys. Salanor cannot truthfully
            rewrite signed events without your keys.
          </p>
          <p>
            Our <Link href="/legal/privacy">Privacy Policy</Link> describes how we handle personal
            data. Enterprise customers may execute a DPA covering regulated content.
          </p>
        </LegalSection>

        <LegalSection title="5. Confidentiality and feedback">
          <p>
            Non-public product information shared during a pilot is confidential unless marked
            public or already known to you without restriction. Feedback you provide may be used
            to improve the Services without royalty.
          </p>
        </LegalSection>

        <LegalSection title="6. Disclaimers">
          <p>
            THE SERVICES ARE PROVIDED &quot;AS IS&quot; DURING PILOT AND EARLY ACCESS. WE DO NOT
            GUARANTEE UNINTERRUPTED OPERATION, ERROR-FREE BEHAVIOR, OR THAT RECORDS WILL BE
            ADMISSIBLE IN ANY PARTICULAR LEGAL PROCEEDING. ADMISSIBILITY DEPENDS ON JURISDICTION,
            PROCEDURE, AND HOW YOU OPERATE THE SYSTEM.
          </p>
        </LegalSection>

        <LegalSection title="7. Limitation of liability">
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, SALANOR AND ITS SUPPLIERS WILL NOT BE LIABLE
            FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR LOST PROFITS,
            EVEN IF ADVISED OF THE POSSIBILITY. OUR AGGREGATE LIABILITY FOR CLAIMS ARISING OUT OF
            THESE TERMS OR THE SERVICES IS LIMITED TO THE GREATER OF (A) AMOUNTS YOU PAID SALANOR
            FOR THE SERVICES IN THE TWELVE MONTHS BEFORE THE CLAIM OR (B) ONE HUNDRED U.S. DOLLARS
            (US$100) IF YOU ARE ON A FREE OR PILOT PROGRAM.
          </p>
          <p>
            Some jurisdictions do not allow certain limits; in those cases our liability is limited
            to the fullest extent permitted.
          </p>
        </LegalSection>

        <LegalSection title="8. Indemnity">
          <p>
            You will defend and indemnify Salanor against third-party claims arising from your use
            of the Services, your agent applications, or your violation of these Terms, except to
            the extent caused by Salanor&apos;s gross negligence or willful misconduct.
          </p>
        </LegalSection>

        <LegalSection title="9. Governing law">
          <p>
            These Terms are governed by the laws of the State of Delaware, USA, excluding conflict
            rules. Courts in Delaware have exclusive jurisdiction, unless mandatory consumer
            protections in your country require otherwise.
          </p>
        </LegalSection>

        <LegalSection title="10. Changes">
          <p>
            We may update these Terms by posting a new version. Continued use after the effective
            date constitutes acceptance. If you object to a material change, stop using the Services
            and contact us to close your account.
          </p>
        </LegalSection>
      </LegalProse>
    </MarketingPage>
  );
}
