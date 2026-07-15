import Link from "next/link";

const PRODUCT_LINKS = [
  { href: "/aegis", label: "Aegis" },
  { href: "/standards", label: "APS-1 Standard" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/standards", label: "Documentation" },
] as const;

const RESEARCH_LINKS = [
  { href: "/aether", label: "Aether program" },
  { href: "/aether", label: "Provenance track" },
  { href: "/aether", label: "Replayability track" },
  { href: "/standards", label: "Standards track" },
] as const;

const COMPANY_LINKS = [
  { href: "/#about", label: "About" },
  { href: "/contact", label: "Design partners" },
  { href: "/contact", label: "Contact" },
] as const;

const LEGAL_LINKS = [
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/terms", label: "Terms" },
] as const;

function FooterColumn({ title, links }: { title: string; links: readonly { href: string; label: string }[] }) {
  return (
    <div>
      <p className="font-mono text-[0.625rem] tracking-[0.14em] text-bone/25 uppercase">{title}</p>
      <ul className="mt-5 flex flex-col gap-2.5">
        {links.map((link) => (
          <li key={`${title}-${link.label}`}>
            <Link
              href={link.href}
              className="text-[0.8125rem] text-bone/45 no-underline transition-colors hover:text-bone/80"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-ink px-4 pt-14 pb-10 text-bone sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 border-b border-white/10 pb-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:gap-12">
          <div>
            <p className="text-lg font-bold tracking-tight text-white">Salanor</p>
            <p className="mt-4 max-w-xs text-[0.8125rem] leading-relaxed text-bone/35">
              The trust layer for systems that act. Infrastructure for a world software now runs.
            </p>
            <p className="mt-6 font-mono text-[0.625rem] leading-relaxed tracking-wide text-bone/20">
              Salanor Ltd. · Registered in England &amp; Wales
            </p>
          </div>
          <FooterColumn title="Product" links={PRODUCT_LINKS} />
          <FooterColumn title="Research" links={RESEARCH_LINKS} />
          <FooterColumn title="Company" links={COMPANY_LINKS} />
        </div>
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[0.6875rem] text-bone/20">© {year} Salanor Ltd. All rights reserved.</p>
          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Legal">
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="font-mono text-[0.6875rem] text-bone/25 no-underline transition-colors hover:text-bone/50"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
