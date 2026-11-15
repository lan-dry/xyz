import type { Metadata } from "next";
import Link from "next/link";

import { MarketingPage } from "@/components/marketing/marketing-page";
import { contactUrl } from "@/lib/site-urls";

export const metadata: Metadata = {
  title: "Aegis for banks",
  description:
    "Delegation of authority, signed receipts, and independent verification for bank automation. Early access for pilot partners.",
  alternates: { canonical: "/banks" },
};

export default function BanksPage() {
  return (
    <MarketingPage
      label="For banks"
      title="Aegis for Internal Audit, risk and compliance"
      lead="Check sensitive automated actions against your rules, require a named approver when needed, and keep a signed record you can verify offline."
      layout="wide"
      backHref="/"
    >
      <>
        <h2>Delegation of authority</h2>
        <p>
          Authority limits live as data: product, amount band, risk, and required role.
          Approvals check the role level at the time of approval, including &quot;or above&quot;.
        </p>

        <h2>The receipt</h2>
        <p>
          Each decision produces a receipt that cites the sealed events underneath it.
          The receipt lists matched rules, policy version and content hash, and the
          people who approved or refused.
        </p>
        <p>
          <Link href="/products/aegis">See the product overview</Link> for an
          illustrative example labelled as synthetic data.
        </p>

        <h2>Independent verification</h2>
        <p>
          Export a bundle and verify it with the offline verifier. A changed fact,
          a bad signature, a missing sequence, or a swapped record is reported by name.
          See the verifier guide in the docs once your pilot is active.
        </p>

        <h2>Low-risk pilot</h2>
        <p>
          Start in record-only mode on one workflow, on your side if required.
          Agree success criteria first. Nothing is blocked until you switch to enforce,
          and that switch is an audited admin action.
        </p>

        <h2>What we need from the bank</h2>
        <ul>
          <li>One workflow owner and one risk or audit contact</li>
          <li>The attributes your core can send for that workflow</li>
          <li>The authority matrix for that product (or a first draft)</li>
          <li>Agreement on hosted vs on-your-side</li>
        </ul>

        <h2>Stage</h2>
        <p>
          Early access. First pilot partners welcome. This is not a certified product.
          Control mappings in exports are mappings, not certifications.
        </p>

        <p style={{ marginTop: "2rem" }}>
          <a href={contactUrl()}>Talk to us about a pilot</a>
        </p>
      </>
    </MarketingPage>
  );
}
