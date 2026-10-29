"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import {
  ConsolePage,
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  StatusBadge,
  ui,
} from "@/components/console/console-ui";

type AuditorPortal = {
  portal: {
    organization_name: string;
    email: string;
    period_start: string;
    period_end: string;
    read_only: boolean;
  };
  traces: Array<{
    trace_id: string;
    agent_id: string;
    started_at: string;
    status: string;
    total_events: number;
  }>;
};

export default function AuditorPortalPage() {
  const params = useParams();
  const token = String(params.token ?? "");
  const apiBase =
    process.env.NEXT_PUBLIC_AEGIS_API_URL?.replace(/\/$/, "") ||
    "http://localhost:8080";

  const portalQuery = useQuery({
    queryKey: ["auditor-portal", token],
    queryFn: async () => {
      const res = await fetch(
        `${apiBase}/v1/public/auditor/${encodeURIComponent(token)}`,
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return (await res.json()) as AuditorPortal;
    },
    enabled: Boolean(token),
  });

  const portal = portalQuery.data?.portal;
  const traces = portalQuery.data?.traces ?? [];

  return (
    <ConsolePage>
      <PageHeader
        title="Auditor portal"
        subtitle={
          portal
            ? `Read-only view for ${portal.organization_name} (${portal.email})`
            : "Scoped evidence access"
        }
      />
      {portalQuery.isPending ? <LoadingBlock /> : null}
      {portalQuery.error ? (
        <ErrorAlert
          message={
            portalQuery.error instanceof Error
              ? portalQuery.error.message
              : "Invite invalid or expired"
          }
        />
      ) : null}
      {portal ? (
        <>
          <p className={ui.cardHint}>
            Period {new Date(portal.period_start).toLocaleDateString()} to{" "}
            {new Date(portal.period_end).toLocaleDateString()}. Access is logged.
          </p>
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Case</th>
                  <th>Agent</th>
                  <th>Status</th>
                  <th>Steps</th>
                </tr>
              </thead>
              <tbody>
                {traces.map((t) => (
                  <tr key={t.trace_id}>
                    <td>{new Date(t.started_at).toLocaleString()}</td>
                    <td className="mono" style={{ fontSize: "0.75rem" }}>
                      {t.trace_id}
                    </td>
                    <td className="mono" style={{ fontSize: "0.75rem" }}>
                      {t.agent_id}
                    </td>
                    <td>
                      <StatusBadge status={t.status} />
                    </td>
                    <td>{t.total_events}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </ConsolePage>
  );
}
