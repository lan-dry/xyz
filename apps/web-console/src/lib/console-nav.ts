import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  Bot,
  Building2,
  FileCheck,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  PieChart,
  Plug,
  Settings,
  Shield,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { t } from "@/lib/i18n";

export type ConsoleNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Dynamic badge key — shell fills Approvals from pending count. */
  badgeKey?: "approvals";
  external?: boolean;
};

/** Pitch order (Phase 3). Get started / Search / Members / Keys / Logs live under Settings or Overview. */
export const AEGIS_NAV: ConsoleNavItem[] = [
  { href: "/aegis", label: t("nav.overview", "Overview"), icon: LayoutDashboard },
  { href: "/aegis/live", label: t("nav.live", "Live feed"), icon: Activity },
  { href: "/aegis/approvals", label: t("nav.approvals", "Approvals"), icon: UserCheck, badgeKey: "approvals" },
  { href: "/aegis/agents", label: t("nav.agents", "Agents"), icon: Bot },
  { href: "/aegis/keys", label: "API keys", icon: KeyRound },
  { href: "/aegis/workflows", label: t("nav.workflows", "Workflows"), icon: GitBranch },
  { href: "/aegis/policies", label: t("nav.policies", "Policies"), icon: Shield },
  { href: "/aegis/coverage", label: "Coverage", icon: PieChart },
  { href: "/aegis/incidents", label: "Incidents", icon: AlertTriangle },
  { href: "/aegis/evidence", label: t("receipt.title", "Receipts"), icon: FileCheck },
  { href: "/aegis/verify", label: t("receipt.verify", "Verify"), icon: ShieldCheck },
  { href: "/aegis/integrations", label: "Integrations", icon: Plug },
  { href: "/aegis/settings", label: t("nav.settings", "Settings"), icon: Settings },
];

export const PLATFORM_OPS_NAV: ConsoleNavItem[] = [
  { href: "/aegis/platform", label: "Platform", icon: Building2 },
];

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/aegis") return pathname === "/aegis";
  if (href === "/aegis/verify") {
    return pathname === "/aegis/verify" || pathname.startsWith("/verify");
  }
  if (href === "/aegis/live") {
    return (
      pathname === "/aegis/live" ||
      pathname.startsWith("/aegis/live/") ||
      pathname === "/aegis/traces" ||
      pathname.startsWith("/aegis/traces/")
    );
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
