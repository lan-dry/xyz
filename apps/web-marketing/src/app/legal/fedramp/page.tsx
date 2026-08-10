import type { Metadata } from "next";
import Link from "next/link";

import { LegalMeta, LegalProse, LegalSection } from "@/components/marketing/legal-prose";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { BRAND } from "@/lib/marketing-content";

export const metadata: Metadata = {
  title: "FedRAMP path",
  description: "Salanor Aegis FedRAMP Moderate authorization path and control inheritance model.",
};

export default function FedRampPage() {
  return (
    <MarketingPage
      label="Compliance"
      title="FedRAMP Moderate path"
      layout="narrow"
      backHref="/trust"
      lead="How we map Aegis to FedRAMP Moderate controls for US public-sector design partners."
    >
      <LegalProse>
        <LegalMeta>
          <strong>Status:</strong> Roadmap · target Q2 2027 · not authorized today
        </LegalMeta>

        <p>
          {BRAND.product} is designed for tenants that will eventually require FedRAMP Moderate.
          Today we ship control-mapping exports and a documented architecture path; formal
          authorization is a roadmap milestone.
        </p>

        <LegalSection title="Inheritance model">
          <ul>
            <li>
              <strong>IaaS/PaaS:</strong> Railway / Vercel / Neon inherit physical and network
              controls from underlying providers (customer responsibility matrix applies).
            </li>
            <li>
              <strong>Aegis API:</strong> tenant isolation, signed audit logs, encryption in
              transit (TLS 1.2+), secrets via environment — no customer private signing keys stored
              for BYOK customer-held keys.
            </li>
            <li>
              <strong>Customer:</strong> BYOK key custody, agent runtime, SIEM retention, export
              storage after download.
            </li>
          </ul>
        </LegalSection>

        <LegalSection title="Control families we map today">
          <ul>
            <li>AC / IA — API keys, console sessions, org-scoped RBAC</li>
            <li>AU — append-only signed events, export bundles, OTel SIEM forwarding</li>
            <li>CM — immutable active policies, versioned drafts</li>
            <li>IR — approval workflows, trace reconstruction, incident export ZIPs</li>
            <li>SC — Ed25519 signatures, Merkle witness batches, transparency log</li>
          </ul>
        </LegalSection>

        <LegalSection title="Path to authorization">
          <ol>
            <li>Complete SOC 2 Type I → Type II (2026)</li>
            <li>Document SSP on FedRAMP templates using Aegis export evidence</li>
            <li>Engage 3PAO assessment for Moderate baseline</li>
            <li>Target agency sponsorship or JAB path for Q2 2027</li>
          </ol>
        </LegalSection>

        <p>
          Questions: <a href="mailto:security@salanor.com">security@salanor.com</a> ·{" "}
          <Link href="/trust">Platform status</Link>
        </p>
      </LegalProse>
    </MarketingPage>
  );
}
