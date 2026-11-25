"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { ConsolePage, LoadingBlock, PageHeader } from "@/components/console/console-ui";
import { idApi } from "@/lib/id-api";
import { canManageOrg } from "@/lib/org-roles";
import type { MeResponse } from "@/lib/types";

import styles from "./settings.module.css";

const ALL_TABS = [
  { href: "/aegis/settings/profile", label: "Profile", adminOnly: false },
  { href: "/aegis/settings/organization", label: "Organization", adminOnly: true },
  { href: "/aegis/settings/members", label: "Members", adminOnly: true },
  { href: "/aegis/settings/billing", label: "Billing", adminOnly: true },
  { href: "/aegis/settings/integrations", label: "Integrations", adminOnly: true },
  { href: "/aegis/settings/governance", label: "Governance", adminOnly: true },
  { href: "/aegis/settings/auditors", label: "Auditors", adminOnly: true },
  { href: "/aegis/settings/security", label: "Security", adminOnly: true },
] as const;

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const meQuery = useQuery({
    queryKey: ["id", "me"],
    queryFn: () => idApi<MeResponse>("/auth/me"),
  });
  const isAdmin = canManageOrg(meQuery.data?.user?.role);
  const tabs = ALL_TABS.filter((tab) => !tab.adminOnly || isAdmin);

  if (meQuery.isPending) {
    return (
      <ConsolePage>
        <PageHeader title="Settings" subtitle="Loading…" />
        <LoadingBlock />
      </ConsolePage>
    );
  }

  return (
    <ConsolePage>
      <PageHeader
        title="Settings"
        subtitle={
          isAdmin
            ? "Manage your account, organization, and console preferences."
            : "Manage your account. Organisation settings are admin-only."
        }
      />
      <nav className={styles.tabs} aria-label="Settings sections">
        {tabs.map((tab) => {
          const active =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`${styles.tab} ${active ? styles.tabActive : ""}`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <div className={styles.content}>{children}</div>
    </ConsolePage>
  );
}
