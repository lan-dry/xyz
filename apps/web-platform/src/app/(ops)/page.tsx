"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity, Building2, Server, Users } from "lucide-react";

import { MetricSparkline, MetricTrend } from "@/components/metric-visuals";
import { OpsShell } from "@/components/ops-shell";
import { ui } from "@/components/ops-ui/ops-ui";
import { usePlatformSession } from "@/hooks/use-platform-session";
import { platformApi } from "@/lib/platform-api";

const QUICK_LINKS = [
  { title: "Provision org", href: "/provision", icon: Building2 },
  { title: "Organizations", href: "/organizations", icon: Building2 },
  { title: "Accounts", href: "/accounts", icon: Users },
  { title: "Plan catalog", href: "/plans", icon: Activity },
  { title: "Marketing leads", href: "/leads", icon: Users },
  { title: "Workers", href: "/workers", icon: Server },
  { title: "Audit log", href: "/audit-logs", icon: Activity },
  { title: "Command reference", href: "/commands", icon: Activity },
] as const;

function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  sparkline,
  trendPct,
  accent,
}: {
  title: string;
  value: string | number;
  hint: React.ReactNode;
  icon: typeof Building2;
  sparkline?: number[];
  trendPct?: number | null;
  accent?: string;
}) {
  return (
    <div className={`${ui.card} ${ui.cardPad}`} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "flex-start" }}>
        <p className={ui.cardTitle} style={{ margin: 0 }}>
          {title}
        </p>
        <Icon size={18} aria-hidden style={{ opacity: 0.45, flexShrink: 0 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "0.75rem" }}>
        <div>
          <p className={ui.cardValue} style={{ margin: 0 }}>
            {value}
          </p>
          <p className={ui.cardHint} style={{ margin: "0.35rem 0 0" }}>
            {hint}
          </p>
          {trendPct !== undefined ? (
            <div style={{ marginTop: "0.35rem" }}>
              <MetricTrend percent={trendPct ?? null} />
            </div>
          ) : null}
        </div>
        {sparkline ? (
          <MetricSparkline values={sparkline} color={accent} width={96} height={32} />
        ) : null}
      </div>
    </div>
  );
}

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
          worker_runs_24h: number;
          worker_errors_24h: number;
          events_daily_7d?: number[];
          worker_runs_daily_7d?: number[];
          events_trend_pct?: number | null;
          worker_runs_trend_pct?: number | null;
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
        <StatCard
          title="Active organizations"
          value={s?.organizations_active ?? "-"}
          hint={<>{s?.organizations_total ?? "-"} total</>}
          icon={Building2}
        />
        <StatCard
          title="Active accounts"
          value={s?.accounts_active ?? "-"}
          hint={<>{s?.accounts_total ?? "-"} total</>}
          icon={Users}
        />
        <StatCard
          title="Events this month"
          value={s ? s.events_this_month.toLocaleString() : "-"}
          hint="Signed ingest · all tenants · 7-day trend"
          icon={Activity}
          sparkline={s?.events_daily_7d}
          trendPct={s?.events_trend_pct}
          accent="var(--console-accent-bright)"
        />
        <StatCard
          title="Worker runs (24h)"
          value={s?.worker_runs_24h ?? "-"}
          hint={
            <>
              {s && s.worker_errors_24h > 0 ? (
                <span style={{ color: "var(--ops-danger)" }}>
                  {s.worker_errors_24h} error(s) ·{" "}
                </span>
              ) : null}
              <Link href="/workers" className={ui.tableLink}>
                View workers →
              </Link>
            </>
          }
          icon={Server}
          sparkline={s?.worker_runs_daily_7d}
          trendPct={s?.worker_runs_trend_pct}
          accent="#6b8cff"
        />
      </div>

      <div className={ui.statGrid}>
        {QUICK_LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`${ui.card} ${ui.cardPad}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
              <p className={ui.cardTitle}>{item.title}</p>
              <item.icon size={18} aria-hidden style={{ opacity: 0.45, flexShrink: 0 }} />
            </div>
            <p className={ui.cardHint} style={{ color: "var(--console-accent-bright)" }}>
              Open →
            </p>
          </Link>
        ))}
      </div>
    </OpsShell>
  );
}
