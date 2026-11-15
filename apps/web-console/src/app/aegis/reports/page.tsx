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
import { ApiError, consoleApi, consoleDownload } from "@/lib/api";

type CannedReport = {
  id: string;
  title: string;
  description: string;
  columns: string[];
};

export default function ReportsPage() {
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

  return (
    <ConsolePage>
      <PageHeader
        title="Forensic reports"
        subtitle="Canned CSV exports for pilot audit review."
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
            <option value="allow">allow</option>
            <option value="hold">hold</option>
            <option value="stop">stop</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
          From
          <input
            type="date"
            className={ui.input}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
          To
          <input
            type="date"
            className={ui.input}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
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
      {data?.reports?.length ? (
        <div className={ui.statGrid}>
          {data.reports.map((report) => (
            <div key={report.id} className={`${ui.card} ${ui.cardPad}`}>
              <div className={ui.cardTitle}>{report.title}</div>
              <p className={ui.cardHint}>{report.description}</p>
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
    </ConsolePage>
  );
}
