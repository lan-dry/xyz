"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import {
  ConsolePage,
  ErrorAlert,
  PageHeader,
  ui,
} from "@/components/console/console-ui";
import { consoleApi } from "@/lib/api";
import { formatConsoleDate } from "@/lib/format-display";

type PlanUsage = {
  plan: string;
  display_name: string;
  active: boolean;
  usage: {
    events_this_month: number;
    ingest_keys: number;
    members: number;
  };
  limits: {
    events_per_month: number | null;
    max_ingest_keys: number;
    max_members: number;
    retention_days: number;
  };
  overage?: {
    events: boolean;
    events_over_by: number;
    notice: string | null;
  };
  current_period_start?: string | null;
  current_period_end?: string | null;
};

function Meter({
  label,
  used,
  cap,
}: {
  label: string;
  used: number;
  cap: number | null;
}) {
  const pct =
    cap != null && cap > 0 ? Math.min(100, (used / cap) * 100) : null;
  return (
    <div style={{ marginBottom: "1rem" }}>
      <p className={ui.muted} style={{ fontSize: "0.875rem", margin: "0 0 0.4rem" }}>
        {label}: <strong style={{ color: "var(--console-fg)" }}>{used}</strong>
        {cap != null ? ` / ${cap}` : " (unlimited)"}
      </p>
      {pct != null ? (
        <div
          style={{
            height: 8,
            borderRadius: 4,
            background: "var(--console-border, #e2e8f0)",
            maxWidth: "28rem",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              borderRadius: 4,
              background:
                pct >= 90
                  ? "var(--console-danger, #b91c1c)"
                  : "var(--console-accent, #0f766e)",
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export default function UsagePage() {
  const query = useQuery({
    queryKey: ["console", "plan-usage", "usage-page"],
    queryFn: () => consoleApi<{ plan_usage: PlanUsage }>("/organization/plan-usage"),
  });

  const usage = query.data?.plan_usage;

  return (
    <ConsolePage>
      <PageHeader
        title="Usage"
        subtitle="This organisation’s event, key, and member counters for the current period. Caps come from your plan."
      />
      {query.isError ? (
        <ErrorAlert error={query.error} />
      ) : !usage ? (
        <p className={ui.muted}>Loading usage…</p>
      ) : (
        <div className={ui.card} style={{ padding: "1.25rem 1.5rem", maxWidth: "40rem" }}>
          <p style={{ margin: "0 0 0.35rem", fontWeight: 600 }}>
            {usage.display_name}{" "}
            <span className="mono" style={{ fontWeight: 400, fontSize: "0.875rem" }}>
              ({usage.plan})
            </span>
          </p>
          <p className={ui.muted} style={{ margin: "0 0 1.25rem", fontSize: "0.8125rem" }}>
            Period:{" "}
            {usage.current_period_start
              ? formatConsoleDate(usage.current_period_start)
              : "—"}{" "}
            →{" "}
            {usage.current_period_end
              ? formatConsoleDate(usage.current_period_end)
              : "—"}
          </p>
          <Meter
            label="Events this month"
            used={usage.usage.events_this_month}
            cap={usage.limits.events_per_month}
          />
          {usage.overage?.events ? (
            <p
              style={{
                margin: "0 0 1rem",
                fontSize: "0.875rem",
                color: "var(--console-danger, #b91c1c)",
              }}
            >
              {usage.overage.notice ?? "Over the monthly event cap."}
              {usage.overage.events_over_by > 0
                ? ` Over by ${usage.overage.events_over_by}.`
                : ""}
            </p>
          ) : null}
          <Meter
            label="Ingest API keys"
            used={usage.usage.ingest_keys}
            cap={usage.limits.max_ingest_keys}
          />
          <Meter
            label="Members"
            used={usage.usage.members}
            cap={usage.limits.max_members}
          />
          <p className={ui.muted} style={{ margin: "0.5rem 0 0", fontSize: "0.8125rem" }}>
            Event retention: {usage.limits.retention_days} days.{" "}
            <Link href="/aegis/settings/billing" className={ui.tableLink}>
              Plan and billing
            </Link>
          </p>
        </div>
      )}
    </ConsolePage>
  );
}
