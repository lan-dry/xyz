import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bot,
  Building2,
  FileOutput,
  KeyRound,
  LayoutDashboard,
  ScrollText,
  Search,
  Settings,
  Shield,
  UserCheck,
  Users,
} from "lucide-react";

export type ConsoleNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
};

export const AEGIS_NAV: ConsoleNavItem[] = [
  { href: "/aegis", label: "Dashboard", icon: LayoutDashboard },
  { href: "/aegis/traces", label: "Traces", icon: Activity },
  { href: "/aegis/search", label: "Search", icon: Search },
  { href: "/aegis/approvals", label: "Approvals", icon: UserCheck },
  { href: "/aegis/members", label: "Members", icon: Users },
  { href: "/aegis/agents", label: "Agents", icon: Bot },
  { href: "/aegis/keys", label: "API keys", icon: KeyRound },
  { href: "/aegis/policies", label: "Policies", icon: Shield },
  { href: "/aegis/logs", label: "Logs", icon: ScrollText },
  { href: "/aegis/exports", label: "Exports", icon: FileOutput },
  { href: "/aegis/settings", label: "Settings", icon: Settings },
];

export const PLATFORM_OPS_NAV: ConsoleNavItem[] = [
  { href: "/aegis/platform", label: "Platform", icon: Building2 },
];

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/aegis") return pathname === "/aegis";
  if (href === "/aegis/settings") {
    return (
      pathname === "/aegis/settings" ||
      pathname.startsWith("/aegis/settings/profile") ||
      pathname.startsWith("/aegis/settings/organization") ||
      pathname.startsWith("/aegis/settings/security") ||
      pathname.startsWith("/aegis/settings/integrations")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
