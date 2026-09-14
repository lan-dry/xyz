"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BadgeCheck,
  CreditCard,
  FileClock,
  KeyRound,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { CONSOLE_AEGIS_BASE, consoleAegisPath } from "@/lib/app-paths";

import { ConsoleUserMenu } from "./console-user-menu";
import { OrgSwitcher } from "./org-switcher";
import { ConsoleTopBar } from "./console-top-bar";

type OrgOption = {
  id: string;
  name: string;
  slug: string;
  role: string;
};

const COLLAPSED_KEY = "aegis.console.sidebar.collapsed";

const navItems: Array<{
  href: string;
  label: string;
  icon: LucideIcon;
}> = [
  { href: CONSOLE_AEGIS_BASE, label: "Dashboard", icon: LayoutDashboard },
  { href: consoleAegisPath("/events"), label: "Events", icon: Activity },
  { href: consoleAegisPath("/api-keys"), label: "API keys", icon: KeyRound },
  { href: consoleAegisPath("/members"), label: "Members", icon: Users },
  { href: consoleAegisPath("/audit"), label: "Audit log", icon: FileClock },
  { href: consoleAegisPath("/policy"), label: "Policy", icon: ShieldCheck },
  { href: consoleAegisPath("/policy/log"), label: "Policy log", icon: BadgeCheck },
  { href: consoleAegisPath("/billing"), label: "Billing", icon: CreditCard },
  { href: consoleAegisPath("/settings"), label: "Settings", icon: Settings },
];

function isActivePath(pathname: string, href: string): boolean {
  if (href === CONSOLE_AEGIS_BASE) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ConsoleShell({
  email,
  organizations,
  activeOrgId,
  signOutControl,
  children,
}: {
  email: string;
  organizations: OrgOption[];
  activeOrgId: string;
  signOutControl: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(COLLAPSED_KEY);
    setCollapsed(saved === "1");
  }, []);

  const activeOrg = useMemo(
    () => organizations.find((organization) => organization.id === activeOrgId) ?? organizations[0],
    [activeOrgId, organizations],
  );
  const userInitials = useMemo(() => {
    if (!email) return "U";
    return email.slice(0, 2).toUpperCase();
  }, [email]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
  }

  return (
    <div
      className="flex h-screen overflow-hidden bg-[var(--console-bg)] font-sans text-[var(--console-fg)]"
      data-console-shell
    >
      <aside
        className={`sticky top-0 flex h-screen flex-col border-r border-[var(--console-border)] bg-[var(--console-surface)] px-3 py-4 transition-[width] duration-200 ease-out ${
          collapsed ? "w-16" : "w-60"
        }`.trim()}
      >
        <div className={`mb-6 flex ${collapsed ? "justify-center" : "items-center justify-between"}`}>
          {!collapsed ? (
            <Link
              href={CONSOLE_AEGIS_BASE}
              className="text-sm font-semibold tracking-tight text-[var(--console-fg)] no-underline"
            >
              Aegis Console
            </Link>
          ) : null}
          <button
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="rounded-md p-1.5 text-[var(--console-fg-subtle)] transition-colors duration-150 hover:bg-[var(--console-surface-hover)] hover:text-[var(--console-fg)]"
            onClick={toggleCollapsed}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        <div className="mb-7">
          <OrgSwitcher organizations={organizations} activeOrgId={activeOrgId} collapsed={collapsed} />
          {!collapsed && activeOrg ? (
            <p className="mt-2 text-xs text-[var(--console-fg-subtle)]">{activeOrg.name}</p>
          ) : null}
        </div>

        <nav className="space-y-1.5">
          {navItems.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors duration-150 ${
                  active
                    ? "bg-[var(--console-nav-active-bg)] !text-[var(--console-nav-active-fg)] font-medium"
                    : "!text-[var(--console-nav-fg)] hover:bg-[var(--console-nav-hover-bg)] hover:!text-[var(--console-nav-active-fg)]"
                } ${collapsed ? "justify-center" : "gap-2"}`.trim()}
              >
                <Icon className="h-4 w-4" />
                {!collapsed ? <span>{item.label}</span> : null}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-[var(--console-border)] pt-3">
          <ConsoleUserMenu
            email={email}
            initials={userInitials}
            collapsed={collapsed}
            signOutControl={signOutControl}
          />
        </div>
      </aside>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ConsoleTopBar />
        <main className="flex-1 overflow-y-auto bg-[var(--console-bg)] px-6 py-8 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
