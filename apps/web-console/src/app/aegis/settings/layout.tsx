"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ConsolePage, PageHeader, ui } from "@/components/console/console-ui";

import styles from "./settings.module.css";

const TABS = [
  { href: "/aegis/settings/profile", label: "Profile" },
  { href: "/aegis/settings/organization", label: "Organization" },
  { href: "/aegis/settings/integrations", label: "Integrations" },
  { href: "/aegis/settings/security", label: "Security" },
] as const;

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <ConsolePage>
      <PageHeader
        title="Settings"
        subtitle="Manage your account, organization, and console preferences."
      />
      <nav className={styles.tabs} aria-label="Settings sections">
        {TABS.map((tab) => {
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
