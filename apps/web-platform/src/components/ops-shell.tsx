"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ClipboardList,
  CreditCard,
  ExternalLink,
  Inbox,
  LayoutDashboard,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
  Sun,
  Terminal,
  UserCircle,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { OpsPage, PageHeader, ui } from "@/components/ops-ui/ops-ui";
import {
  applyOpsTheme,
  persistOpsTheme,
  resolveOpsTheme,
  toggleOpsTheme,
  type OpsTheme,
} from "@/lib/ops-theme";
import { CONSOLE_URL } from "@/lib/urls";

import shell from "./ops-shell.module.css";

const SIDEBAR_KEY = "salanor.ops.sidebar.collapsed";

const NAV: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/provision", label: "Provision org", icon: UserPlus },
  { href: "/organizations", label: "Organizations", icon: Building2 },
  { href: "/accounts", label: "Accounts", icon: Users },
  { href: "/team", label: "Platform team", icon: Shield },
  { href: "/plans", label: "Plans", icon: CreditCard },
  { href: "/leads", label: "Leads", icon: Inbox },
  { href: "/audit-logs", label: "Audit log", icon: ClipboardList },
  { href: "/commands", label: "Commands", icon: Terminal },
  { href: "/settings", label: "Profile", icon: UserCircle },
];

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
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const resolved = resolveOpsTheme();
    applyOpsTheme(resolved);
    setTheme(resolved);
    setCollapsed(window.localStorage.getItem(SIDEBAR_KEY) === "1");
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

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    window.localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
  }

  function onThemeToggle() {
    const next: OpsTheme = theme === "dark" ? "light" : "dark";
    applyOpsTheme(next);
    persistOpsTheme(next);
    setTheme(next);
  }

  return (
    <div className={shell.shell} data-console-shell data-console-app>
      <aside
        className={`${shell.sidebar} ${collapsed ? shell.sidebarCollapsed : ""}`}
        aria-label="Platform navigation"
      >
        <div className={shell.brand}>
          <div className={shell.brandText}>
            <p className={shell.brandEyebrow}>Salanor internal</p>
            <p className={shell.brandName}>Platform Ops</p>
          </div>
          <button
            type="button"
            className={shell.collapseBtn}
            onClick={toggleSidebar}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
        <div className={shell.sidebarScroll}>
          <nav className={shell.nav}>
            {NAV.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${shell.navLink} ${active ? shell.navLinkActive : ""}`}
                  title={item.label}
                >
                  <Icon className={shell.navIcon} aria-hidden />
                  <span className={shell.navLabel}>{item.label}</span>
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
            <Link href="/settings" className={`${ui.btn} ${ui.btnGhost}`} title="Your profile">
              <UserCircle size={14} aria-hidden />
              Profile
            </Link>
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
