"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Building2,
  FileBarChart,
  LayoutDashboard,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  ScrollText,
  Shield,
  ShieldCheck,
  Sun,
  Users,
  KeyRound,
  Monitor,
  Network,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AdminReadOnlyBanner } from "@/components/admin-read-only-banner";
import { siteManagerOnly as isSiteManagerOnly } from "@/lib/admin-session";

import {
  SIDEBAR_COLLAPSED_KEY,
  applyTheme,
  cycleThemePreference,
  readStoredThemePreference,
  resolveTheme,
  themePreferenceLabel,
  type StoaAdminTheme,
  type StoaThemePreference,
} from "@/lib/stoa-admin-theme";
import { fetchSession, type SessionInfo } from "@/lib/stoa-client";

import styles from "./admin-shell.module.css";

const NAV: {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/providers", label: "Providers", icon: Plug },
  { href: "/admin/gateway", label: "API keys", icon: Network },
  { href: "/admin/models", label: "Policy", icon: Shield },
  { href: "/admin/users", label: "Access", icon: Users },
  { href: "/admin/sites", label: "Sites", icon: Building2 },
  { href: "/admin/identity", label: "Sign-in", icon: KeyRound },
  { href: "/admin/usage", label: "Usage", icon: BarChart3 },
  { href: "/admin/reports", label: "Reports", icon: FileBarChart },
  { href: "/admin/compliance", label: "Compliance", icon: ShieldCheck },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
];

const SITE_MANAGER_NAV_HREFS = new Set(["/admin/sites"]);

function navActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<StoaAdminTheme>("light");
  const [themePreference, setThemePreference] =
    useState<StoaThemePreference>("system");

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    setThemePreference(readStoredThemePreference() ?? "system");
    const resolved = resolveTheme();
    applyTheme(resolved);
    setTheme(resolved);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    function onSystemChange() {
      if ((readStoredThemePreference() ?? "system") === "system") {
        const resolved = resolveTheme();
        applyTheme(resolved);
        setTheme(resolved);
      }
    }
    mq.addEventListener("change", onSystemChange);
    return () => mq.removeEventListener("change", onSystemChange);
  }, []);

  useEffect(() => {
    fetchSession()
      .then((me) => {
        setSession(me);
        if (!me.adminConsole?.canAccess && !me.isAdmin) {
          setError("You don't have access to administration.");
        }
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
  }

  function onThemeToggle() {
    const pref = cycleThemePreference();
    setThemePreference(pref);
    setTheme(resolveTheme());
  }

  const navItems = useMemo(() => {
    if (session && isSiteManagerOnly(session)) {
      return NAV.filter(
        (item) =>
          SITE_MANAGER_NAV_HREFS.has(item.href) ||
          item.href.startsWith("/admin/sites/"),
      );
    }
    return NAV;
  }, [session]);

  if (error) {
    return (
      <div className={styles.denied}>
        <p>{error}</p>
        <Link href="/">Back to workspace</Link>
      </div>
    );
  }

  if (!session?.adminConsole?.canAccess && !session?.isAdmin) {
    return <p className={styles.loading}>Loading administration…</p>;
  }

  return (
    <div className={styles.shell}>
      <aside
        className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ""}`}
      >
        <div className={`${styles.brand} ${collapsed ? styles.brandCollapsed : ""}`}>
          {!collapsed ? (
            <div className={styles.brandText}>
              <span className={styles.logo}>Stoa</span>
              <span className={styles.tag}>Administration</span>
            </div>
          ) : null}
          <button
            type="button"
            className={styles.collapseBtn}
            onClick={toggleSidebar}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} aria-hidden />
            ) : (
              <PanelLeftClose size={18} aria-hidden />
            )}
          </button>
        </div>
        <nav className={styles.nav}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = navActive(pathname, item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={active ? styles.navActive : styles.navLink}
              >
                <Icon size={16} className={styles.navIcon} aria-hidden />
                {!collapsed ? (
                  <span className={styles.navLabel}>{item.label}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className={styles.footer}>
          {!collapsed ? (
            <>
              <p>{session.tenant.name}</p>
              <p className={styles.muted}>{session.user.email}</p>
            </>
          ) : null}
          <div className={styles.footerActions}>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={onThemeToggle}
              aria-label={`Theme: ${themePreferenceLabel(themePreference)}. Press to cycle.`}
              title={`Theme: ${themePreferenceLabel(themePreference)}`}
            >
              {themePreference === "system" ? (
                <Monitor size={16} />
              ) : theme === "dark" ? (
                <Sun size={16} />
              ) : (
                <Moon size={16} />
              )}
            </button>
            <Link href="/" className={styles.back} title="Workspace">
              {collapsed ? "←" : "← Workspace"}
            </Link>
          </div>
        </div>
      </aside>
      <div className={styles.contentColumn}>
        <main className={styles.main}>
          <AdminReadOnlyBanner
            readOnly={session.adminConsole?.readOnly === true}
            siteManagerOnly={session.adminConsole?.siteManagerOnly === true}
          />
          {children}
        </main>
      </div>
    </div>
  );
}
