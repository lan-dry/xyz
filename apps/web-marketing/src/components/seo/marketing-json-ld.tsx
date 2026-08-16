import { getSiteContact } from "@/lib/site-contact";
import { SITE_ORIGIN } from "@/lib/site-origin";

function postalAddressFromLines(lines: string[]) {
  const streetAddress = lines[0] ?? "";
  const localityLine = lines[1] ?? "";
  const [addressLocality, ...rest] = localityLine.split(",").map((s) => s.trim());
  const addressCountry = rest.join(", ") || "Rwanda";
  return {
    "@type": "PostalAddress" as const,
    streetAddress,
    addressLocality: addressLocality || undefined,
    addressCountry,
  };
}

/** Organization + Aegis SoftwareApplication structured data for brand SERPs. */
export function MarketingJsonLd() {
  const contact = getSiteContact();
  const sameAs = contact.social.map((s) => s.url).filter(Boolean);
  const email =
    contact.channels.find((c) => c.id === "general")?.email ?? "hello@salanor.com";

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_ORIGIN}/#organization`,
    name: "Salanor",
    legalName: "Salanor Ltd",
    url: SITE_ORIGIN,
    logo: {
      "@type": "ImageObject",
      url: `${SITE_ORIGIN}/salanor-og.png`,
    },
    email,
    address: postalAddressFromLines(contact.address.lines),
    sameAs,
    description:
      "Salanor builds provenance and liability coverage for AI agents. Aegis signs APS-1 events with policy enforcement and compliance exports.",
  };

  const aegis = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${SITE_ORIGIN}/products/aegis#software`,
    name: "Salanor Aegis",
    alternateName: ["Aegis", "Aegis by Salanor"],
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: `${SITE_ORIGIN}/products/aegis`,
    description:
      "Aegis by Salanor: cryptographically signed provenance for AI agent actions. APS-1 ledger, policy enforcement, and compliance exports.",
    provider: { "@id": `${SITE_ORIGIN}/#organization` },
    brand: {
      "@type": "Brand",
      name: "Salanor",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aegis) }}
      />
    </>
  );
}
