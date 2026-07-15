"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  ExternalLink,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { AEGIS_NAV, isNavActive, type ConsoleNavItem } from "@/lib/console-nav";
import {
  applyConsoleTheme,
  persistConsoleTheme,
  resolveConsoleTheme,
  toggleConsoleTheme,
  type ConsoleTheme,
} from "@/lib/console-theme";
import { PLATFORM_PRODUCTS } from "@/lib/products";
import { docsUrl, MARKETING_URL, PLATFORM_URL } from "@/lib/site-urls";
import type { ConsoleImpersonation, ConsoleOrganization, ConsoleUser } from "@/lib/types";

import { SalanorLogo } from "@/components/salanor-logo";

import { OrgDisplay } from "./org-display";
import shell from "./console-shell.module.css";
import { ui } from "./console-ui";

const SIDEBAR_KEY = "salanor.console.sidebar.collapsed";

function TopLink({
  href,
  label,
  icon: Icon,
  external,
}: {
  href: string;
  label: string;
  icon: typeof ExternalLink;
  external?: boolean;
}) {
  const className = `${ui.btn} ${ui.btnGhost} ${shell.utilityLink}`;
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        <Icon size={14} aria-hidden />
        {label}
      </a>
    );
  }
  return (
    <a href={href} className={className}>
      <Icon size={14} aria-hidden />
      {label}
    </a>
  );
}

export function ConsoleShell({
  product,
  navItems = AEGIS_NAV,
  user,
  platformStaff: _platformStaff = false,
  impersonation = null,
  onEndImpersonation,
  organization,
  organizations,
  onLogout,
  children,
}: {
  product: "aegis" | "insurance";
  navItems?: ConsoleNavItem[];
  user: ConsoleUser;
  /** Salanor employee — link to Platform Ops app in header (not in customer sidebar). */
  platformStaff?: boolean;
  impersonation?: ConsoleImpersonation | null;
  onEndImpersonation?: () => void;
  organization: ConsoleOrganization;
  organizations: ConsoleOrganization[];
  onLogout: () => void;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<ConsoleTheme>("light");

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(SIDEBAR_KEY) === "1");
    const resolved = resolveConsoleTheme();
    applyConsoleTheme(resolved);
    setTheme(resolved);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const key = e.key?.toLowerCase();
      if (!key || key !== "m" || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      setTheme(toggleConsoleTheme());
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    window.localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
  }

  function onThemeToggle() {
    const next: ConsoleTheme = theme === "dark" ? "light" : "dark";
    applyConsoleTheme(next);
    persistConsoleTheme(next);
    setTheme(next);
  }

  const productTitle = product === "aegis" ? "Aegis" : "Insurance";

  return (
    <div
      className={shell.shell}
      data-console-shell
      data-console-app
    >
      <aside
        className={`${shell.sidebar} ${collapsed ? shell.sidebarCollapsed : ""}`}
      >
        <div className={shell.brand}>
          {!collapsed ? (
            <Link href="/aegis" className={shell.brandLink}>
              <SalanorLogo
                size={28}
                showWordmark
                sublabel={`${productTitle} console`}
              />
            </Link>
          ) : (
            <Link href="/aegis" className={shell.brandLink} title="Salanor">
              <SalanorLogo size={28} />
            </Link>
          )}
          <button
            type="button"
            className={shell.collapseBtn}
            onClick={toggleSidebar}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
          </button>
        </div>

        <div className={shell.sidebarScroll}>
          <nav className={shell.nav} aria-label={`${productTitle} navigation`}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isNavActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${shell.navLink} ${active ? shell.navLinkActive : ""}`}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className={shell.navIcon} aria-hidden />
                  <span className={shell.navLabel}>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className={shell.productBlock}>
          {!collapsed ? <p className={shell.productLabel}>Products</p> : null}
          {PLATFORM_PRODUCTS.map((p) => {
            const active =
              pathname === p.href || pathname.startsWith(`${p.href}/`);
            return (
              <Link
                key={p.slug}
                href={p.href}
                className={`${shell.productLink} ${active ? shell.productLinkActive : ""}`}
                title={collapsed ? p.name : undefined}
              >
                {p.name}
                {p.status === "preview" ? " · preview" : ""}
              </Link>
            );
          })}
        </div>
      </aside>

      <div className={shell.main}>
        <header className={shell.topBar}>
          <div className={shell.topBarLeft}>
            <OrgDisplay organization={organization} organizations={organizations} />
          </div>
          <div className={shell.topBarRight}>
            <TopLink href={docsUrl("aegis")} label="Documentation" icon={BookOpen} external />
            <TopLink href={MARKETING_URL} label="Marketing" icon={ExternalLink} external />
            <button
              type="button"
              className={`${ui.btn} ${ui.btnGhost} ${shell.utilityLink}`}
              onClick={onThemeToggle}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              title={`Theme (${theme}) · press M`}
            >
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <span className={shell.roleBadge}>{user.role}</span>
            <span className={shell.userEmail} title={user.email}>
              {user.email}
            </span>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              onClick={onLogout}
            >
              Log out
            </button>
          </div>
        </header>
        {impersonation ? (
          <div className={shell.impersonationBanner} role="status">
            <div>
              <strong>Support impersonation</strong> — viewing{" "}
              <strong>{impersonation.organization_name}</strong> ({impersonation.organization_slug})
              {" · "}
              acting as <strong>{impersonation.actor_email}</strong>
              {" · "}
              effective role: <strong>{impersonation.effective_role}</strong>
            </div>
            <div className={shell.impersonationActions}>
              <a href={PLATFORM_URL} className={`${ui.btn} ${ui.btnSecondary}`}>
                Platform Ops
              </a>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnPrimary}`}
                onClick={onEndImpersonation}
              >
                Exit impersonation
              </button>
            </div>
          </div>
        ) : null}
        <div className={shell.content}>{children}</div>
      </div>
    </div>
  );
}
