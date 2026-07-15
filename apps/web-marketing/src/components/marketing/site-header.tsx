"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";

import { ConsoleNavLink } from "./console-nav-link";
import { contactUrl, docsUrl } from "@/lib/site-urls";
import { PRODUCTS } from "@/lib/marketing-content";

import btn from "./buttons.module.css";
import { DocsDropdown, type DocsNavItem } from "./docs-dropdown";
import { NavTextLink } from "./nav-link";
import { ProductsDropdown, type ProductNavItem } from "./products-dropdown";
import { SalanorLogo } from "./salanor-logo";
import styles from "./site-header.module.css";

const PRODUCT_NAV: ProductNavItem[] = [
  {
    href: "/products/aegis",
    label: PRODUCTS.aegis.name,
    description: PRODUCTS.aegis.tag,
    badge: "GA 2026",
  },
  {
    href: "/products/aether",
    label: PRODUCTS.aether.name,
    description: PRODUCTS.aether.tag,
    badge: "2027",
  },
];

const DOCS_NAV: DocsNavItem[] = [
  { product: "aegis", label: "Aegis", description: "SDK, API, APS-1 events" },
  { product: "aether", label: "Aether", description: "Intelligence layer (preview)" },
];

const NAV_LINKS = [
  { href: "/about", label: "About" },
  { href: "/spec", label: "Specs" },
  { href: "/#how", label: "How it works" },
  { href: "/contact", label: "Contact" },
] as const;

function MenuIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const mobileId = useId();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);

  const closeAll = useCallback(() => {
    setMobileOpen(false);
    setProductsOpen(false);
    setDocsOpen(false);
  }, []);

  useEffect(() => {
    closeAll();
  }, [pathname, closeAll]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <>
      <header className={styles.header}>
        <div className={styles.left}>
          <Link href="/" className={styles.logoLink} onClick={closeAll}>
            <SalanorLogo />
          </Link>
        </div>

        <nav className={styles.nav} aria-label="Primary">
          <ProductsDropdown
            items={PRODUCT_NAV}
            open={productsOpen}
            onOpenChange={(open) => {
              setProductsOpen(open);
              if (open) setDocsOpen(false);
            }}
          />
          {NAV_LINKS.map((item) => (
            <NavTextLink key={item.href} href={item.href}>
              {item.label}
            </NavTextLink>
          ))}
          <DocsDropdown
            items={DOCS_NAV}
            open={docsOpen}
            onOpenChange={(open) => {
              setDocsOpen(open);
              if (open) setProductsOpen(false);
            }}
          />
        </nav>

        <div className={styles.right}>
          <ConsoleNavLink />
          <a href={contactUrl()} className={`${btn.btnPrimary} ${btn.btnPrimaryNav}`}>
            Get access
          </a>
          <button
            type="button"
            className={styles.menuBtn}
            aria-expanded={mobileOpen}
            aria-controls={mobileId}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen((v) => !v)}
          >
            <MenuIcon open={mobileOpen} />
          </button>
        </div>
      </header>

      <div
        id={mobileId}
        className={`${styles.mobilePanel} ${mobileOpen ? styles.mobilePanelOpen : ""}`}
        hidden={!mobileOpen}
      >
        <p className={styles.mobileSectionLabel}>Products</p>
        <ul className={styles.mobileNav}>
          {PRODUCT_NAV.map((item) => (
            <li key={item.href}>
              <Link href={item.href} onClick={closeAll}>
                <strong style={{ color: "var(--text)", fontWeight: 500 }}>{item.label}</strong>
                <span style={{ display: "block", fontSize: "0.75rem", marginTop: "0.125rem" }}>
                  {item.description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className={styles.mobileSectionLabel}>Documentation</p>
        <ul className={styles.mobileNav}>
          {DOCS_NAV.map((item) => (
            <li key={item.product}>
              <a href={docsUrl(item.product)} onClick={closeAll}>
                <strong style={{ color: "var(--text)", fontWeight: 500 }}>{item.label}</strong>
                <span style={{ display: "block", fontSize: "0.75rem", marginTop: "0.125rem" }}>
                  {item.description}
                </span>
              </a>
            </li>
          ))}
          {NAV_LINKS.map((item) => (
            <li key={`m-${item.href}`}>
              <Link href={item.href} onClick={closeAll}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className={styles.mobileCtas}>
          <ConsoleNavLink className={btn.btnGhost} onClick={closeAll} />
          <a href={contactUrl()} className={btn.btnPrimary} onClick={closeAll}>
            Get access
          </a>
        </div>
      </div>
    </>
  );
}
