"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Building2,
  Check,
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
import { useEffect, useMemo, useRef, useState } from "react";

import { AdminReadOnlyBanner } from "@/components/admin-read-only-banner";
import { siteManagerOnly as isSiteManagerOnly } from "@/lib/admin-session";

import {
  SIDEBAR_COLLAPSED_KEY,
  applyTheme,
  persistThemePreference,
  readStoredThemePreference,
  resolveTheme,
  type StoaAdminTheme,
  type StoaThemePreference,
} from "@/lib/stoa-admin-theme";
import { useAdminSession } from "@/hooks/use-admin-session";

import styles from "./admin-shell.module.css";

const THEME_OPTIONS: {
  id: StoaThemePreference;
  label: string;
  icon: LucideIcon;
}[] = [
  { id: "system", label: "System", icon: Monitor },
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
];

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

function siteManagerAllowedPath(pathname: string): boolean {
  return (
    pathname === "/admin/sites" ||
    pathname.startsWith("/admin/sites/") ||
    pathname.startsWith("/admin/people/")
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const sessionQuery = useAdminSession();
  const session = sessionQuery.data ?? null;
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<StoaAdminTheme>("light");
  const [themePreference, setThemePreference] =
    useState<StoaThemePreference>("system");
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const accessDenied =
    session != null &&
    !session.adminConsole?.canAccess &&
    !session.isAdmin;

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
    if (!themeMenuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (
        themeMenuRef.current &&
        !themeMenuRef.current.contains(event.target as Node)
      ) {
        setThemeMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setThemeMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [themeMenuOpen]);

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
  }

  function setThemeChoice(pref: StoaThemePreference) {
    persistThemePreference(pref);
    setThemePreference(pref);
    setTheme(resolveTheme());
    setThemeMenuOpen(false);
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

  useEffect(() => {
    if (!session || !isSiteManagerOnly(session)) {
      return;
    }
    if (!siteManagerAllowedPath(pathname)) {
      router.replace("/admin/sites");
    }
  }, [session, pathname, router]);

  if (sessionQuery.isError) {
    return (
      <div className={styles.denied}>
        <p>{(sessionQuery.error as Error).message}</p>
        <Link href="/">Back to workspace</Link>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className={styles.denied}>
        <p>You don&apos;t have access to administration.</p>
        <Link href="/">Back to workspace</Link>
      </div>
    );
  }

  if (!session) {
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
              <span className={styles.logo}>Workspace</span>
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
          <div className={styles.footerActions} ref={themeMenuRef}>
            {themeMenuOpen ? (
              <div
                className={styles.themeMenu}
                role="menu"
                aria-label="Theme"
              >
                {THEME_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const selected = themePreference === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      className={
                        selected ? styles.themeMenuItemActive : styles.themeMenuItem
                      }
                      onClick={() => setThemeChoice(option.id)}
                    >
                      <Icon size={14} aria-hidden />
                      <span>{option.label}</span>
                      {selected ? (
                        <Check size={14} className={styles.themeCheck} aria-hidden />
                      ) : (
                        <span className={styles.themeCheckSpacer} aria-hidden />
                      )}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => setThemeMenuOpen((open) => !open)}
              aria-label="Theme"
              aria-expanded={themeMenuOpen}
              aria-haspopup="menu"
              title="Theme"
            >
              {themePreference === "system" ? (
                <Monitor size={16} />
              ) : theme === "dark" ? (
                <Moon size={16} />
              ) : (
                <Sun size={16} />
              )}
            </button>
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
