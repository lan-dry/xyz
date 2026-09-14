"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";

import { marketingInkCtaClass } from "@/components/marketing-cta";
import { SalanorLogo } from "@/components/salanor-logo";
import {
  getClientAegisProductUrl,
  getClientConsolePublicUrl,
  getClientDocsPublicUrl,
  getClientMarketingHomeUrl,
  resolveEffectiveRequestHost,
} from "@/lib/client-public-url";
import { DOCS_AEGIS_BASE } from "@/lib/app-paths";
import { isDocsPublicHost } from "@/lib/public-hosts";

const NAV_ITEMS = [
  { key: "home" as const, label: "Product" },
  { key: "docs" as const, label: "Docs" },
  { key: "pricing" as const, label: "Pricing" },
];

function useAegisNav() {
  const pathname = usePathname();
  const [host, setHost] = useState(() =>
    typeof window !== "undefined" ? window.location.host : "",
  );

  useEffect(() => {
    setHost(window.location.host);
  }, []);

  const requestHost = resolveEffectiveRequestHost(host);
  const onDocsPath =
    pathname === DOCS_AEGIS_BASE || pathname.startsWith(`${DOCS_AEGIS_BASE}/`);
  const onDocsHost = onDocsPath || isDocsPublicHost(requestHost);

  const hrefFor = (key: (typeof NAV_ITEMS)[number]["key"]) => {
    if (onDocsHost) {
      if (key === "docs") return getClientDocsPublicUrl(requestHost);
      if (key === "home") return getClientAegisProductUrl(requestHost);
      if (key === "pricing") return `${getClientAegisProductUrl(requestHost).replace(/\/$/, "")}/pricing`;
    }
    if (key === "home") return "/aegis";
    if (key === "docs") return getClientDocsPublicUrl(requestHost);
    return `/aegis/${key}`;
  };

  const isActive = (key: (typeof NAV_ITEMS)[number]["key"]) => {
    if (onDocsHost) return key === "docs";
    if (key === "home") return pathname === "/aegis" || pathname === "/aegis/";
    if (key === "pricing") return pathname.startsWith("/aegis/pricing");
    return pathname.startsWith(DOCS_AEGIS_BASE) || pathname.startsWith("/aegis/docs");
  };

  const salanorHome = onDocsHost ? getClientMarketingHomeUrl(requestHost) : "/";

  const consoleHref = getClientConsolePublicUrl(requestHost);

  return { hrefFor, isActive, salanorHome, consoleHref };
}

export function AegisSiteHeader() {
  const pathname = usePathname();
  const mobileMenuId = useId();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { hrefFor, isActive, salanorHome, consoleHref } = useAegisNav();

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    closeMobile();
  }, [pathname, closeMobile]);

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
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href={hrefFor("home")}
            className="shrink-0 no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal"
            onClick={closeMobile}
          >
            <span className="text-lg font-semibold tracking-tight text-ink">Aegis</span>
          </Link>
          <span className="hidden text-xs text-ink/45 sm:inline">by</span>
          <Link
            href={salanorHome}
            className="hidden shrink-0 no-underline sm:inline-flex"
            title="Salanor home"
            onClick={closeMobile}
          >
            <SalanorLogo showWordmark markClassName="h-6 w-6" wordmarkClassName="text-sm font-medium text-ink/70" />
          </Link>
        </div>

        <nav aria-label="Aegis" className="hidden items-center gap-6 lg:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={hrefFor(item.key)}
              className={`text-sm font-medium no-underline transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal ${
                isActive(item.key) ? "text-ink" : "text-ink/75 hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <Link
            href={consoleHref}
            className={`rounded-full px-4 py-2 text-sm font-medium no-underline transition-opacity hover:opacity-90 ${marketingInkCtaClass}`}
          >
            Console
          </Link>
        </nav>

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

      <div
        id={mobileMenuId}
        className={`overflow-hidden border-t border-black/10 bg-bone/95 backdrop-blur-md transition-[max-height,opacity] duration-300 lg:hidden ${
          mobileOpen ? "max-h-80 opacity-100" : "max-h-0 opacity-0"
        }`}
        hidden={!mobileOpen}
      >
        <nav aria-label="Aegis mobile" className="mx-auto flex max-w-7xl flex-col gap-1 px-6 py-4">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={hrefFor(item.key)}
              onClick={closeMobile}
              className={`rounded-lg px-3 py-2 text-sm font-medium no-underline ${
                isActive(item.key) ? "bg-ink/5 text-ink" : "text-ink/80 hover:bg-ink/5"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <Link
            href={consoleHref}
            onClick={closeMobile}
            className={`mt-2 inline-flex justify-center rounded-full px-4 py-2.5 text-sm font-medium no-underline ${marketingInkCtaClass}`}
          >
            Console
          </Link>
        </nav>
      </div>
    </header>
  );
}
