"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { AegisMark } from "@/components/console/aegis-mark";
import { EmptyStatePanel } from "@/components/console/empty-state-panel";
import {
  ConsolePage,
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  StatusBadge,
  ui,
} from "@/components/console/console-ui";
import { consoleApi } from "@/lib/api";
import {
  environmentLabel,
  readConsoleEnvironment,
  type ConsoleEnvironment,
} from "@/lib/console-environment";

type IncidentRow = {
  incident_id: string;
  title: string;
  severity: string;
  status: string;
  summary: string | null;
  trace_id: string | null;
  created_at: string;
};

export default function IncidentsPage() {
  const [environment, setEnvironment] = useState<ConsoleEnvironment>("production");

  useEffect(() => {
    setEnvironment(readConsoleEnvironment());
    function onEnv(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail === "sandbox" || detail === "production") setEnvironment(detail);
    }
    window.addEventListener("salanor:console-environment", onEnv);
    return () => window.removeEventListener("salanor:console-environment", onEnv);
  }, []);

  const listQuery = useQuery({
    queryKey: ["console", "incidents", environment],
    queryFn: () =>
      consoleApi<{ incidents: IncidentRow[]; error?: string }>(
        `/incidents?environment=${environment}&ensure=duplicate-payout`,
      ),
  });

  const incidents = listQuery.data?.incidents ?? [];

  return (
    <ConsolePage>
      <PageHeader
        title="Incidents"
        subtitle={`Investigate denials and duplicate payouts for ${environmentLabel(environment)}. Open a case to replay and compare policy today.`}
        actions={
          <Link href="/aegis/policies?simulate=90" className={`${ui.btn} ${ui.btnSecondary}`}>
            Simulate policy (90d)
          </Link>
        }
      />

      {listQuery.isPending ? <LoadingBlock /> : null}
      {listQuery.error ? (
        <ErrorAlert message="Failed to load incidents. Run pnpm db:migrate if migration 009 is pending." />
      ) : null}

      {!listQuery.isPending && !listQuery.error && incidents.length === 0 ? (
        <EmptyStatePanel
          mark={<AegisMark />}
          title="No incidents yet"
          description="Blocked cases still appear in Live feed. Duplicate-payout seed appears after migrate 009."
          action={
            <Link href="/aegis/live?status=blocked" className={`${ui.btn} ${ui.btnPrimary}`}>
              <AlertTriangle size={14} aria-hidden /> Blocked in live feed
            </Link>
          }
        />
      ) : null}

      {incidents.length > 0 ? (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Incident</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Opened</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc) => (
                <tr key={inc.incident_id}>
                  <td>
                    <Link
                      href={`/aegis/incidents/${encodeURIComponent(inc.incident_id)}`}
                      className={ui.tableLink}
                      style={{ fontWeight: 600 }}
                    >
                      {inc.title}
                    </Link>
                    {inc.summary ? (
                      <p className={ui.cardHint} style={{ margin: "0.25rem 0 0" }}>
                        {inc.summary}
                      </p>
                    ) : null}
                  </td>
                  <td>
                    <StatusBadge status={inc.severity} />
                  </td>
                  <td>
                    <StatusBadge status={inc.status} />
                  </td>
                  <td>{new Date(inc.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </ConsolePage>
  );
}
