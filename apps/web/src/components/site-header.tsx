"use client";

import { ChevronDown, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { marketingInkCtaClass } from "@/components/marketing-cta";
import { SalanorLogo } from "@/components/salanor-logo";

const PRODUCT_LINKS = [
  { href: "/aegis", label: "Aegis", description: "Verifiable decision records" },
  { href: "/aether", label: "Aether", description: "Accountable autonomy research" },
  { href: "/standards", label: "APS-1", description: "Agent Provenance Standard" },
] as const;

const NAV_LINKS = [
  { href: "/research", label: "Research" },
  { href: "/about", label: "About" },
  { href: "/careers", label: "Careers" },
  { href: "/contact", label: "Contact" },
] as const;

function NavLink({
  href,
  label,
  onNavigate,
  className = "",
}: {
  href: string;
  label: string;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`marketing-nav-link text-sm font-medium text-ink/90 no-underline transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal ${className}`}
    >
      {label}
    </Link>
  );
}

function ProductsPanel({
  id,
  labelledBy,
  open,
  className = "",
  onNavigate,
}: {
  id: string;
  labelledBy: string;
  open: boolean;
  className?: string;
  onNavigate?: () => void;
}) {
  return (
    <div
      id={id}
      role="menu"
      aria-labelledby={labelledBy}
      className={`origin-top transition-[opacity,transform] duration-200 ${
        open ? "pointer-events-auto scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
      } ${className}`}
    >
      <ul className="flex flex-col gap-0.5">
        {PRODUCT_LINKS.map((item) => (
          <li key={item.href} role="none">
            <Link
              href={item.href}
              role="menuitem"
              onClick={onNavigate}
              className="block rounded-lg px-3 py-2.5 no-underline transition-colors hover:bg-ink/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
            >
              <span className="block text-sm font-medium text-ink">{item.label}</span>
              <span className="mt-0.5 block text-xs text-ink/60">{item.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProductsDropdown({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) {
        onOpenChange(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        id={`${menuId}-button`}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={`${menuId}-menu`}
        onClick={() => onOpenChange(!open)}
        className="marketing-nav-link inline-flex items-center gap-1 text-sm font-medium text-ink/90 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal"
      >
        Products
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      <ProductsPanel
        id={`${menuId}-menu`}
        labelledBy={`${menuId}-button`}
        open={open}
        className="absolute left-0 top-[calc(100%+0.5rem)] z-50 min-w-[16rem] rounded-xl border border-black/10 bg-bone/95 p-2 shadow-lg backdrop-blur-md"
        onNavigate={() => onOpenChange(false)}
      />
    </div>
  );
}

function ProductsMobileSection({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="pb-3">
      <p className="px-1 text-xs font-medium uppercase tracking-wide text-ink/50">Products</p>
      <ul className="mt-2 flex flex-col gap-1">
        {PRODUCT_LINKS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              className="block rounded-lg px-3 py-2 no-underline transition-colors hover:bg-ink/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
            >
              <span className="text-sm font-medium text-ink">{item.label}</span>
              <span className="mt-0.5 block text-xs text-ink/60">{item.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const mobileMenuId = useId();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);

  const closeMenus = useCallback(() => {
    setMobileOpen(false);
    setProductsOpen(false);
  }, []);

  useEffect(() => {
    closeMenus();
  }, [pathname, closeMenus]);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const shell = document.querySelector<HTMLElement>("[data-marketing-shell]");
    if (!shell) return;
    shell.style.setProperty("--site-header-offset", scrolled ? "4.25rem" : "5.25rem");
  }, [scrolled]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <header
      className={`site-header fixed inset-x-0 top-0 z-50 border-b transition-[background-color,box-shadow,border-color,padding] duration-300 ${
        scrolled
          ? "site-header--compact border-black/10 bg-bone/80 py-3 shadow-[0_8px_24px_-12px_rgba(11,31,28,0.18)] backdrop-blur-md"
          : "border-transparent bg-bone/90 py-5 backdrop-blur-sm"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6">
        <Link
          href="/"
          className="shrink-0 no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal"
          onClick={closeMenus}
        >
          <SalanorLogo markClassName={scrolled ? "h-7 w-7 transition-[height,width] duration-300" : "h-8 w-8 transition-[height,width] duration-300"} />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-8 lg:flex">
          <ProductsDropdown open={productsOpen} onOpenChange={setProductsOpen} />
          {NAV_LINKS.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} />
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/contact"
            className={`hidden rounded-full px-4 py-2 text-sm font-medium no-underline transition-opacity hover:opacity-90 lg:inline-flex ${marketingInkCtaClass}`}
          >
            Talk to us
          </Link>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink transition-colors hover:bg-ink/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal lg:hidden"
            aria-expanded={mobileOpen}
            aria-controls={mobileMenuId}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen((value) => !value)}
          >
            {mobileOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>

      <div
        id={mobileMenuId}
        className={`overflow-hidden border-t border-black/10 bg-bone/95 backdrop-blur-md transition-[max-height,opacity] duration-300 lg:hidden ${
          mobileOpen ? "max-h-[32rem] opacity-100" : "max-h-0 opacity-0"
        }`}
        hidden={!mobileOpen}
      >
        <nav aria-label="Mobile" className="mx-auto flex max-w-7xl flex-col gap-1 px-6 py-4">
          <ProductsMobileSection onNavigate={closeMenus} />
          {NAV_LINKS.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              onNavigate={closeMenus}
              className="rounded-lg px-3 py-2 hover:bg-ink/5"
            />
          ))}
          <Link
            href="/contact"
            onClick={closeMenus}
            className={`mt-3 inline-flex justify-center rounded-full px-4 py-2.5 text-sm font-medium no-underline transition-opacity hover:opacity-90 ${marketingInkCtaClass}`}
          >
            Talk to us
          </Link>
        </nav>
      </div>
    </header>
  );
}
