import Link from "next/link";

import { BRAND } from "@/lib/marketing-content";
import { docsUrl } from "@/lib/site-urls";

import { SalanorLogo } from "./salanor-logo";
import styles from "./site-footer.module.css";

const PRODUCT_LINKS = [
  { href: "/products/aegis", label: "Aegis" },
  { href: "/products/aether", label: "Aether" },
  { href: "/spec", label: "APS-1 & did:agent" },
  { href: "/contact", label: "Pricing" },
] as const;

const DEVELOPER_LINKS = [
  { href: "/spec", label: "APS-1 & did:agent" },
  { href: docsUrl("aegis"), label: "Aegis docs", external: true },
  { href: docsUrl("aegis"), label: "@salanor/aegis SDK", external: true },
  { href: docsUrl("aether"), label: "Aether docs", external: true },
  { href: "https://github.com/salanor-ltd/salanor", label: "GitHub", external: true },
] as const;

const COMPLIANCE_LINKS = [
  { href: "/#compliance", label: "EU AI Act" },
  { href: "/#compliance", label: "SOC 2" },
  { href: "/#compliance", label: "HIPAA" },
  { href: "/#compliance", label: "FedRAMP" },
] as const;

const COMPANY_LINKS = [
  { href: "/about", label: "About" },
  { href: "/about/founding", label: "Founding note" },
  { href: "/blog", label: "Blog" },
  { href: "/careers", label: "Careers" },
  { href: "/contact", label: "Contact" },
] as const;

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: readonly { href: string; label: string; external?: boolean }[];
}) {
  return (
    <div className={styles.col}>
      <h4>{title}</h4>
      <ul>
        {links.map((link) => (
          <li key={`${title}-${link.label}`}>
            {link.external ? (
              <a href={link.href} target="_blank" rel="noopener noreferrer">
                {link.label}
              </a>
            ) : (
              <Link href={link.href}>{link.label}</Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer} id="company">
      <div className={styles.inner}>
        <div className={styles.brand}>
          <div className={styles.logoRow}>
            <SalanorLogo showWordmark />
          </div>
          <p className={styles.tagline}>{BRAND.taglineFull}</p>
        </div>
        <div className={styles.cols}>
          <FooterColumn title="Products" links={PRODUCT_LINKS} />
          <FooterColumn title="Developers" links={DEVELOPER_LINKS} />
          <FooterColumn title="Compliance" links={COMPLIANCE_LINKS} />
          <FooterColumn title="Company" links={COMPANY_LINKS} />
        </div>
      </div>
      <div className={styles.bottom}>
        <p>© {year} Salanor Systems, Inc. All rights reserved.</p>
        <nav className={styles.legal} aria-label="Legal">
          <Link href="/legal/privacy">Privacy</Link>
          <Link href="/legal/terms">Terms</Link>
          <Link href="/legal/security">Security</Link>
        </nav>
      </div>
    </footer>
  );
}
