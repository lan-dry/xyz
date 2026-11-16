"use client";

import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useState } from "react";

import {
  ConsolePage,
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  ui,
} from "@/components/console/console-ui";
import { DateInput } from "@/components/console/date-input";
import { ConsoleTime } from "@/components/console/console-time";
import { ApiError, consoleApi, consoleDownload } from "@/lib/api";
import { isBankDemoProfile } from "@/lib/ui-profile";

type CannedReport = {
  id: string;
  title: string;
  description: string;
  columns: string[];
};

type ReportPreview = {
  report_id: string;
  title: string;
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, unknown>>;
  total: number;
  total_capped: boolean;
};

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function PreviewCell({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") return <>-</>;
  if (typeof value === "string" && ISO_TIME.test(value)) return <ConsoleTime iso={value} />;
  if (typeof value === "object") return <>{JSON.stringify(value)}</>;
  return <>{String(value)}</>;
}

export default function ReportsPage() {
  const bank = isBankDemoProfile();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const qs = new URLSearchParams();
  if (outcome) qs.set("outcome", outcome);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const query = qs.toString();

  const { data, isLoading, error } = useQuery({
    queryKey: ["canned-reports", query],
    queryFn: () =>
      consoleApi<{ stub: boolean; reports: CannedReport[] }>(
        `/reports/canned${query ? `?${query}` : ""}`,
      ),
  });

  const reports = data?.reports ?? [];
  const activeId =
    selectedId && reports.some((r) => r.id === selectedId) ? selectedId : (reports[0]?.id ?? null);
  const active = reports.find((r) => r.id === activeId) ?? null;

  const previewQuery = useQuery({
    queryKey: ["canned-report-preview", activeId],
    enabled: Boolean(activeId),
    queryFn: () =>
      consoleApi<{ preview: ReportPreview }>(`/reports/canned/${activeId}/preview?limit=10`),
  });
  const preview = previewQuery.data?.preview;

  return (
    <ConsolePage>
      <PageHeader
        title={bank ? "Reports" : "Forensic reports"}
        subtitle={
          bank
            ? "Download case records as CSV. Check the first rows below before you download."
            : "Canned CSV exports for pilot audit review."
        }
      />
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          marginBottom: "1.25rem",
          alignItems: "end",
        }}
      >
        <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
          Outcome
          <select
            className={ui.input}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          >
            <option value="">All</option>
            <option value="allow">{bank ? "Allowed" : "allow"}</option>
            <option value="hold">{bank ? "Needs approval" : "hold"}</option>
            <option value="stop">{bank ? "Stopped" : "stop"}</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
          From
          <DateInput value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
          To
          <DateInput value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      {isLoading ? <LoadingBlock /> : null}
      {error ? (
        <ErrorAlert
          message={
            error instanceof ApiError
              ? error.message
              : "Failed to load reports"
          }
        />
      ) : null}
      {reports.length ? (
        <div className={ui.reportGrid}>
          {reports.map((report) => (
            <div
              key={report.id}
              className={`${ui.card} ${ui.cardPad}`}
              style={report.id === activeId ? { borderColor: "var(--console-accent)" } : undefined}
            >
              <div className={ui.cardTitle}>{report.title}</div>
              <p className={ui.cardHint}>{report.description}</p>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnSecondary}`}
                style={{ marginRight: "0.5rem" }}
                aria-pressed={report.id === activeId}
                onClick={() => setSelectedId(report.id)}
              >
                Preview
              </button>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnSecondary}`}
                onClick={() =>
                  void consoleDownload(
                    `/reports/canned/${report.id}/csv${query ? `?${query}` : ""}`,
                    `${report.id}.csv`,
                  )
                }
              >
                <Download size={14} aria-hidden /> Export CSV
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {active ? (
        <section
          className={`${ui.card} ${ui.cardPad}`}
          style={{ marginTop: "1.25rem" }}
          aria-label={`Preview of ${active.title}`}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "0.75rem",
              marginBottom: "0.75rem",
            }}
          >
            <div>
              <div className={ui.cardTitle}>Preview: {active.title}</div>
              <p className={ui.cardHint} style={{ margin: 0 }}>
                {previewQuery.isLoading
                  ? "Loading the first rows…"
                  : preview
                    ? preview.total === 0
                      ? "No rows yet. The CSV would hold only the column headings."
                      : `Showing the first ${preview.rows.length} of ${preview.total_capped ? "more than " : ""}${preview.total.toLocaleString("en-US")} ${preview.total === 1 ? "row" : "rows"}. The CSV has the same columns.`
                    : ""}
              </p>
            </div>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              onClick={() =>
                void consoleDownload(
                  `/reports/canned/${active.id}/csv${query ? `?${query}` : ""}`,
                  `${active.id}.csv`,
                )
              }
            >
              <Download size={14} aria-hidden /> Download CSV
            </button>
          </div>
          {previewQuery.error ? (
            <ErrorAlert
              message={
                previewQuery.error instanceof ApiError
                  ? previewQuery.error.message
                  : "Failed to load the preview."
              }
            />
          ) : null}
          {preview ? (
            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    {preview.columns.map((col) => (
                      <th key={col.key}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, i) => (
                    <tr key={i}>
                      {preview.columns.map((col) => (
                        <td key={col.key}>
                          <PreviewCell value={row[col.key]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}
    </ConsolePage>
  );
}
