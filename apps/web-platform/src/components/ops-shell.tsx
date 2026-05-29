"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, Moon, Sun } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { OpsPage, PageHeader, ui } from "@/components/ops-ui/ops-ui";
import { applyOpsTheme, persistOpsTheme, resolveOpsTheme, toggleOpsTheme, type OpsTheme } from "@/lib/ops-theme";
import { CONSOLE_URL } from "@/lib/urls";

import shell from "./ops-shell.module.css";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/provision", label: "Provision org" },
  { href: "/organizations", label: "Organizations" },
  { href: "/accounts", label: "Accounts" },
  { href: "/plans", label: "Plans" },
  { href: "/leads", label: "Leads" },
  { href: "/audit-logs", label: "Audit log" },
  { href: "/commands", label: "Commands" },
] as const;

export function OpsShell({
  title,
  subtitle,
  actions,
  children,
  staffEmail,
  onLogout,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  staffEmail: string;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<OpsTheme>("light");

  useEffect(() => {
    const resolved = resolveOpsTheme();
    applyOpsTheme(resolved);
    setTheme(resolved);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const key = e.key?.toLowerCase();
      if (!key || key !== "m" || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      setTheme(toggleOpsTheme());
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onThemeToggle() {
    const next: OpsTheme = theme === "dark" ? "light" : "dark";
    applyOpsTheme(next);
    persistOpsTheme(next);
    setTheme(next);
  }

  return (
    <div className={shell.shell} data-console-shell data-console-app>
      <aside className={shell.sidebar} aria-label="Platform navigation">
        <div className={shell.brand}>
          <p className={shell.brandEyebrow}>Salanor internal</p>
          <p className={shell.brandName}>Platform Ops</p>
        </div>
        <div className={shell.sidebarScroll}>
          <nav className={shell.nav}>
            {NAV.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${shell.navLink} ${active ? shell.navLinkActive : ""}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      <div className={shell.main}>
        <header className={shell.topBar}>
          <span className={shell.brandEyebrow}>Platform Ops</span>
          <div className={shell.topBarRight}>
            <a
              href={CONSOLE_URL}
              className={`${ui.btn} ${ui.btnGhost}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={14} aria-hidden />
              Customer console
            </a>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnGhost}`}
              onClick={onThemeToggle}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              title={`Theme (${theme}) · press M`}
            >
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            <span className={shell.userEmail} title={staffEmail}>
              {staffEmail}
            </span>
            <button type="button" className={`${ui.btn} ${ui.btnPrimary}`} onClick={onLogout}>
              Log out
            </button>
          </div>
        </header>

        <div className={shell.content}>
          <OpsPage>
            <PageHeader title={title} subtitle={subtitle} actions={actions} />
            {children}
          </OpsPage>
        </div>
      </div>
    </div>
  );
}
