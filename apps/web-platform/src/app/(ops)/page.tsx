"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { OpsShell } from "@/components/ops-shell";
import { ui } from "@/components/ops-ui/ops-ui";
import { usePlatformSession } from "@/hooks/use-platform-session";
import { platformApi } from "@/lib/platform-api";

const QUICK_LINKS = [
  { title: "Provision org", href: "/provision" },
  { title: "Organizations", href: "/organizations" },
  { title: "Accounts", href: "/accounts" },
  { title: "Plan catalog", href: "/plans" },
  { title: "Marketing leads", href: "/leads" },
  { title: "Audit log", href: "/audit-logs" },
  { title: "Command reference", href: "/commands" },
] as const;

export default function PlatformOverviewPage() {
  const { email, logout } = usePlatformSession();

  const statsQuery = useQuery({
    queryKey: ["platform", "stats"],
    queryFn: () =>
      platformApi<{
        stats: {
          organizations_total: number;
          organizations_active: number;
          accounts_total: number;
          accounts_active: number;
          events_this_month: number;
        };
      }>("overview/stats"),
  });

  const s = statsQuery.data?.stats;

  return (
    <OpsShell
      title="Overview"
      subtitle="Cross-tenant administration. Customers use the Aegis Console separately."
      staffEmail={email}
      onLogout={logout}
    >
      <div className={ui.statGrid}>
        <div className={`${ui.card} ${ui.cardPad}`}>
          <p className={ui.cardTitle}>Active organizations</p>
          <p className={ui.cardValue}>{s?.organizations_active ?? "—"}</p>
          <p className={ui.cardHint}>{s?.organizations_total ?? "—"} total</p>
        </div>
        <div className={`${ui.card} ${ui.cardPad}`}>
          <p className={ui.cardTitle}>Active accounts</p>
          <p className={ui.cardValue}>{s?.accounts_active ?? "—"}</p>
          <p className={ui.cardHint}>{s?.accounts_total ?? "—"} total</p>
        </div>
        <div className={`${ui.card} ${ui.cardPad}`}>
          <p className={ui.cardTitle}>Events this month</p>
          <p className={ui.cardValue}>
            {s ? s.events_this_month.toLocaleString() : "—"}
          </p>
          <p className={ui.cardHint}>All tenants</p>
        </div>
      </div>

      <div className={ui.statGrid}>
        {QUICK_LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`${ui.card} ${ui.cardPad}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <p className={ui.cardTitle}>{item.title}</p>
            <p className={ui.cardHint} style={{ color: "var(--console-accent-bright)" }}>
              Open →
            </p>
          </Link>
        ))}
      </div>
    </OpsShell>
  );
}
