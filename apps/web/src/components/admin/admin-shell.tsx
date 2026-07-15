"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Briefcase,
  Building2,
  Inbox,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { adminNavGroupsForRole } from "@/lib/admin/nav";
import { type InternalRole, isAdminReadOnly } from "@/lib/admin/roles";

import { AdminTopBar } from "./admin-top-bar";
import { AdminUserMenu } from "./admin-user-menu";

const COLLAPSED_KEY = "salanor.admin.sidebar.collapsed";

const NAV_ICONS: Record<string, LucideIcon> = {
  "/admin": LayoutDashboard,
  "/admin/contacts": Inbox,
  "/admin/research": BookOpen,
  "/admin/careers": Briefcase,
  "/admin/organizations": Building2,
  "/admin/users": Users,
  "/admin/internal-users": Shield,
};

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/admin") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({
  email,
  role,
  signOutControl,
  children,
}: {
  email: string;
  role: InternalRole;
  signOutControl: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const navGroups = useMemo(() => adminNavGroupsForRole(role), [role]);
  const readOnly = isAdminReadOnly(role);

  useEffect(() => {
    const saved = window.localStorage.getItem(COLLAPSED_KEY);
    setCollapsed(saved === "1");
  }, []);

  const userInitials = useMemo(() => {
    if (!email) return "A";
    return email.slice(0, 2).toUpperCase();
  }, [email]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
  }

  return (
    <div
      className="flex h-screen overflow-hidden bg-[var(--admin-bg)] font-sans text-[var(--admin-fg)]"
      data-admin-shell
    >
      <aside
        className={`sticky top-0 flex h-screen flex-col border-r border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-4 transition-[width] duration-200 ease-out ${
          collapsed ? "w-16" : "w-60"
        }`.trim()}
      >
        <div className={`mb-6 flex ${collapsed ? "justify-center" : "items-center justify-between"}`}>
          {!collapsed ? (
            <Link
              href="/admin"
              className="text-sm font-semibold tracking-tight text-[var(--admin-fg)] no-underline"
            >
              Salanor Admin
            </Link>
          ) : null}
          <button
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="rounded-md p-1.5 text-[var(--admin-fg-subtle)] transition-colors duration-150 hover:bg-[var(--admin-surface-hover)] hover:text-[var(--admin-fg)]"
            onClick={toggleCollapsed}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.label}>
              {!collapsed ? (
                <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
                  {group.label}
                </p>
              ) : null}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = isActivePath(pathname, item.href);
                  const Icon = NAV_ICONS[item.href] ?? LayoutDashboard;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors duration-150 ${
                        active
                          ? "bg-[var(--admin-nav-active-bg)] !text-[var(--admin-nav-active-fg)]"
                          : "!text-[var(--admin-nav-fg)] hover:bg-[var(--admin-nav-hover-bg)] hover:!text-[var(--admin-nav-active-fg)]"
                      } ${collapsed ? "justify-center" : "gap-2"}`.trim()}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed ? <span>{item.label}</span> : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-auto border-t border-[var(--admin-border)] pt-3">
          <AdminUserMenu
            email={email}
            role={role}
            readOnly={readOnly}
            initials={userInitials}
            collapsed={collapsed}
            signOutControl={signOutControl}
          />
        </div>
      </aside>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <AdminTopBar />
        <main className="flex-1 overflow-y-auto bg-[var(--admin-bg)] px-6 py-8 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
