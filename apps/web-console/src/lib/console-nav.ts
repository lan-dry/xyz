import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  Bot,
  FileCheck,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  Plug,
  ScrollText,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";
import { t } from "@/lib/i18n";
import { isBankDemoProfile } from "@/lib/ui-profile";

export type ConsoleNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Dynamic badge key — shell fills Approvals from pending count. */
  badgeKey?: "approvals";
  external?: boolean;
};

/**
 * Default (production-style) nav. Includes Rules, Cases (with search), Reports,
 * Access log and Delegations. In-console simulator removed — use standalone bank-simulator.
 */
export const AEGIS_NAV: ConsoleNavItem[] = [
  { href: "/aegis", label: t("nav.overview", "Overview"), icon: LayoutDashboard },
  { href: "/aegis/live", label: t("nav.live", "Live feed"), icon: Activity },
  { href: "/aegis/approvals", label: t("nav.approvals", "Approvals"), icon: UserCheck, badgeKey: "approvals" },
  { href: "/aegis/policies", label: "Rules", icon: Shield },
  { href: "/aegis/delegations", label: "Delegations", icon: Users },
  { href: "/aegis/traces", label: "Cases", icon: Search },
  { href: "/aegis/reports", label: "Reports", icon: FileCheck },
  {
    href: "/verify",
    label: t("receipt.verify", "Verify"),
    icon: ShieldCheck,
    external: true,
  },
  { href: "/aegis/logs", label: "Access log", icon: ScrollText },
  { href: "/aegis/agents", label: t("nav.agents", "Agents"), icon: Bot },
  { href: "/aegis/keys", label: "API keys", icon: KeyRound },
  { href: "/aegis/workflows", label: t("nav.workflows", "Workflows"), icon: GitBranch },
  { href: "/aegis/incidents", label: "Incidents", icon: AlertTriangle },
  { href: "/aegis/evidence", label: t("receipt.title", "Receipts"), icon: FileCheck },
  { href: "/aegis/integrations", label: "Integrations", icon: Plug },
  { href: "/aegis/settings", label: t("nav.settings", "Settings"), icon: Settings },
];

/** bank_demo profile (3.11): only what the rehearsal needs. */
export const BANK_DEMO_NAV: ConsoleNavItem[] = [
  { href: "/aegis", label: t("nav.overview", "Overview"), icon: LayoutDashboard },
  { href: "/aegis/live", label: t("nav.live", "Live feed"), icon: Activity },
  { href: "/aegis/approvals", label: t("nav.approvals", "Approvals"), icon: UserCheck, badgeKey: "approvals" },
  { href: "/aegis/policies", label: "Rules", icon: Shield },
  { href: "/aegis/delegations", label: "Delegations", icon: Users },
  { href: "/aegis/traces", label: "Cases", icon: Search },
  { href: "/aegis/reports", label: "Reports", icon: FileCheck },
  {
    href: "/verify",
    label: t("receipt.verify", "Verify"),
    icon: ShieldCheck,
    external: true,
  },
  { href: "/aegis/logs", label: "Access log", icon: ScrollText },
];

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/aegis") return pathname === "/aegis";
  if (href === "/verify" || href === "/aegis/verify") {
    return pathname === "/aegis/verify" || pathname.startsWith("/verify");
  }
  if (href === "/aegis/live") {
    // Cases has its own nav entry in both profiles.
    return pathname === "/aegis/live" || pathname.startsWith("/aegis/live/");
  }
  if (href === "/aegis/traces") {
    return pathname === "/aegis/traces" || pathname.startsWith("/aegis/traces/");
  }
  if (href === "/aegis/evidence") {
    return (
      pathname.startsWith("/aegis/evidence") ||
      pathname.startsWith("/aegis/exports")
    );
  }
  if (href === "/aegis/settings") {
    return (
      pathname === "/aegis/settings" ||
      pathname.startsWith("/aegis/settings/")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Nav for the active UI profile. */
export function navForProfile(): ConsoleNavItem[] {
  return isBankDemoProfile() ? BANK_DEMO_NAV : AEGIS_NAV;
}
