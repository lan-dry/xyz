"use client";

import { BookOpen, CalendarClock, Download, FileArchive, Info, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { CopyButton } from "@/components/console/copy-button";
import { EmptyStatePanel } from "@/components/console/empty-state-panel";
import {
  ExportsHelpPanel,
  type ExportHelpSection,
} from "@/components/console/exports-help-panel";
import {
  ConsolePage,
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  StatusBadge,
  ui,
} from "@/components/console/console-ui";
import { consoleApi, consoleDownload } from "@/lib/api";

import styles from "./exports.module.css";

type ComplianceExport = {
  export_id: string;
  bundle_type: string;
  status: string;
  period_start: string;
  period_end: string;
  generated_at: string | null;
  integrity_hash: string | null;
  event_count: number | null;
  byte_size: number | null;
};

type ComplianceSchedule = {
  schedule_id: string;
  bundle_type: string;
  cadence: string;
  enabled: boolean;
  day_of_month: number;
  last_run_at: string | null;
  next_run_at: string | null;
};

const BUNDLE_TYPES = [
  { value: "soc2", label: "SOC 2" },
  { value: "eu_ai_act", label: "EU AI Act" },
  { value: "combined", label: "Combined (recommended)" },
] as const;

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function bundleLabel(value: string): string {
  return BUNDLE_TYPES.find((b) => b.value === value)?.label ?? value;
}

export default function ExportsPage() {
  const queryClient = useQueryClient();
  const [bundleType, setBundleType] = useState<string>("combined");
  const [runNow, setRunNow] = useState(true);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleBundle, setScheduleBundle] = useState("combined");
  const [scheduleDay, setScheduleDay] = useState(1);
  const [scheduleSaved, setScheduleSaved] = useState(false);
  const [helpPanel, setHelpPanel] = useState<ExportHelpSection | null>(null);

  const exportsQuery = useQuery({
    queryKey: ["console", "compliance-exports"],
    queryFn: () =>
      consoleApi<{ exports: ComplianceExport[] }>("/compliance/exports"),
    refetchInterval: (query) => {
      const list = query.state.data?.exports ?? [];
      const hasQueued = list.some(
        (e) => e.status === "pending" || e.status === "processing",
      );
      return hasQueued ? 5000 : false;
    },
  });

  const scheduleQuery = useQuery({
    queryKey: ["console", "compliance-schedule"],
    queryFn: () =>
      consoleApi<{ schedule: ComplianceSchedule | null }>("/compliance/schedule"),
  });

  const saveSchedule = useMutation({
    mutationFn: () =>
      consoleApi<{ schedule: ComplianceSchedule }>("/compliance/schedule", {
        method: "PUT",
        body: JSON.stringify({
          enabled: scheduleEnabled,
          bundle_type: scheduleBundle,
          day_of_month: scheduleDay,
        }),
      }),
    onSuccess: (data) => {
      setScheduleEnabled(data.schedule.enabled);
      setScheduleBundle(data.schedule.bundle_type);
      setScheduleDay(data.schedule.day_of_month);
      setScheduleSaved(true);
      window.setTimeout(() => setScheduleSaved(false), 3000);
      void queryClient.invalidateQueries({
        queryKey: ["console", "compliance-schedule"],
      });
    },
  });

  const createExport = useMutation({
    mutationFn: () => {
      const end = new Date();
      const start = new Date(end);
      start.setDate(start.getDate() - 30);
      return consoleApi<{ export: ComplianceExport }>("/compliance/exports", {
        method: "POST",
        body: JSON.stringify({
          bundle_type: bundleType,
          period_start: start.toISOString(),
          period_end: end.toISOString(),
          run_now: runNow,
        }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["console", "compliance-exports"],
      });
    },
  });

  const downloadExport = useMutation({
    mutationFn: async (row: ComplianceExport) => {
      setDownloadError(null);
      await consoleDownload(
        `/compliance/exports/${encodeURIComponent(row.export_id)}/download`,
        `${row.export_id}.zip`,
      );
    },
    onError: (err) => {
      setDownloadError(err instanceof Error ? err.message : "Download failed");
    },
  });

  const exports = exportsQuery.data?.exports ?? [];
  const pendingExports = exports.filter(
    (e) => e.status === "pending" || e.status === "processing",
  );
  const schedule = scheduleQuery.data?.schedule;
  const loading = exportsQuery.isLoading || scheduleQuery.isLoading;

  useEffect(() => {
    if (!schedule) return;
    setScheduleEnabled(schedule.enabled);
    setScheduleBundle(schedule.bundle_type);
    setScheduleDay(schedule.day_of_month);
  }, [schedule?.schedule_id, schedule?.enabled, schedule?.bundle_type, schedule?.day_of_month]);

  return (
    <ConsolePage>
      <PageHeader
        title="Compliance exports"
        subtitle="Download tamper-evident audit bundles with SOC 2 and EU AI Act control mapping."
        actions={
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              onClick={() => setHelpPanel("files")}
              aria-label="What is exported?"
            >
              <Info size={16} aria-hidden />
              What’s exported?
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              onClick={() => setHelpPanel("how")}
              aria-label="How exports work"
            >
              <BookOpen size={16} aria-hidden />
              How exports work
            </button>
          </div>
        }
      />
      <ExportsHelpPanel
        open={helpPanel !== null}
        section={helpPanel ?? "files"}
        onClose={() => setHelpPanel(null)}
      />

      {pendingExports.length > 0 ? (
        <div className={`${ui.alert} ${ui.alertInfo}`} style={{ marginBottom: "1rem" }}>
          <strong>
            {pendingExports.length} export{pendingExports.length === 1 ? "" : "s"} queued
          </strong>
          <p style={{ margin: "0.35rem 0 0", fontSize: "0.8125rem", lineHeight: 1.5 }}>
            Status stays <em>pending</em> until the compliance worker runs on the API host. In
            development, run{" "}
            <code className="mono" style={{ fontSize: "0.75rem" }}>
              pnpm compliance:worker
            </code>{" "}
            from the repo root (or enable a daily cron in production — see{" "}
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => setHelpPanel("how")}
            >
              How exports work
            </button>
            ).
          </p>
        </div>
      ) : null}

      <div className={styles.layout}>
        <div className={styles.actionsGrid}>
          <section className={`${ui.card} ${ui.cardPad} ${styles.actionCard}`}>
            <h2 className={ui.panelTitle}>
              <Plus size={18} style={{ verticalAlign: "-3px", marginRight: "0.35rem" }} />
              One-time export
            </h2>
            <div className={styles.actionCardBody}>
              <p className={styles.cardDesc}>
                Generate a bundle for the <strong>last 30 days</strong>. Use this for demos and
                ad-hoc auditor requests.
              </p>
              <label className={ui.field}>
                Bundle type
                <select
                  className={ui.select}
                  value={bundleType}
                  onChange={(e) => setBundleType(e.target.value)}
                >
                  {BUNDLE_TYPES.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={runNow}
                  onChange={(e) => setRunNow(e.target.checked)}
                />
                <span>
                  <span className={styles.toggleLabel}>Generate immediately</span>
                  <span className={styles.toggleHint}>
                    Uncheck to queue only (requires compliance worker).
                  </span>
                </span>
              </label>
              {createExport.error ? (
                <ErrorAlert message={(createExport.error as Error).message} />
              ) : null}
            </div>
            <div className={styles.actionCardFooter}>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnPrimary} ${styles.fullWidthBtn}`}
                disabled={createExport.isPending}
                onClick={() => createExport.mutate()}
              >
                {createExport.isPending ? "Generating…" : "Create export"}
              </button>
            </div>
          </section>

          <section className={`${ui.card} ${ui.cardPad} ${styles.actionCard}`}>
            <h2 className={ui.panelTitle}>
              <CalendarClock
                size={18}
                style={{ verticalAlign: "-3px", marginRight: "0.35rem" }}
              />
              Monthly schedule
            </h2>
            <form
              className={styles.actionCardBody}
              onSubmit={(e) => {
                e.preventDefault();
                saveSchedule.mutate();
              }}
            >
              <p className={styles.cardDesc}>
                Automatically export the <strong>previous calendar month</strong> on the day you
                choose (UTC). Best for ongoing SOC 2 Type I evidence.
              </p>

              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={scheduleEnabled}
                  onChange={(e) => setScheduleEnabled(e.target.checked)}
                />
                <span>
                  <span className={styles.toggleLabel}>Enable monthly auto-export</span>
                  <span className={styles.toggleHint}>
                    Requires a daily server job — see “What’s exported?”
                  </span>
                </span>
              </label>

              <div
                className={styles.fieldRow}
                style={{ opacity: scheduleEnabled ? 1 : 0.55 }}
              >
                <label className={ui.field}>
                  Bundle type
                  <select
                    className={ui.select}
                    value={scheduleBundle}
                    onChange={(e) => setScheduleBundle(e.target.value)}
                    disabled={!scheduleEnabled}
                  >
                    {BUNDLE_TYPES.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={ui.field}>
                  Day of month (UTC)
                  <input
                    className={ui.input}
                    type="number"
                    min={1}
                    max={28}
                    value={scheduleDay}
                    onChange={(e) => setScheduleDay(Number(e.target.value))}
                    disabled={!scheduleEnabled}
                  />
                </label>
              </div>

              {scheduleEnabled && schedule?.next_run_at ? (
                <p className={styles.scheduleMeta}>
                  <strong>Next run:</strong>{" "}
                  {new Date(schedule.next_run_at).toLocaleString()}
                  {schedule.last_run_at ? (
                    <>
                      <br />
                      <strong>Last run:</strong>{" "}
                      {new Date(schedule.last_run_at).toLocaleString()}
                    </>
                  ) : null}
                </p>
              ) : null}

              {saveSchedule.error ? (
                <ErrorAlert message={(saveSchedule.error as Error).message} />
              ) : null}
              {scheduleSaved ? (
                <div className={`${ui.alert} ${ui.alertSuccess}`}>Schedule saved.</div>
              ) : null}

              <div className={styles.actionCardFooter}>
                <button
                  type="submit"
                  className={`${ui.btn} ${scheduleEnabled ? ui.btnPrimary : ui.btnSecondary} ${styles.fullWidthBtn}`}
                  disabled={saveSchedule.isPending}
                >
                  {saveSchedule.isPending ? "Saving…" : "Save schedule"}
                </button>
              </div>
            </form>
          </section>
        </div>

        <section className={`${ui.card} ${ui.cardPad} ${styles.historySection}`}>
          <div className={styles.historyHeader}>
            <div>
              <h2>Your exports</h2>
              <p>Ready bundles for the period you selected. Use the info button above for ZIP contents.</p>
            </div>
          </div>

          {loading ? <LoadingBlock /> : null}
          {exportsQuery.error ? (
            <ErrorAlert message="Failed to load compliance exports." />
          ) : null}
          {downloadError ? <ErrorAlert message={downloadError} /> : null}

          {!loading && exports.length === 0 ? (
            <EmptyStatePanel
              icon={FileArchive}
              title="No exports yet"
              description="Use the forms above to create a one-time export or enable the monthly schedule."
            />
          ) : null}

          {exports.length > 0 ? (
            <ExportTable
              exports={exports}
              onDownload={(row) => downloadExport.mutate(row)}
              downloadingId={
                downloadExport.isPending ? downloadExport.variables?.export_id : null
              }
            />
          ) : null}
        </section>
      </div>

    </ConsolePage>
  );
}

function ExportTable({
  exports,
  onDownload,
  downloadingId,
}: {
  exports: ComplianceExport[];
  onDownload: (row: ComplianceExport) => void;
  downloadingId: string | null | undefined;
}) {
  return (
    <div className={ui.tableWrap}>
      <table className={ui.table}>
        <thead>
          <tr>
            <th>Bundle</th>
            <th>Status</th>
            <th>Period</th>
            <th>Events</th>
            <th>Size</th>
            <th>Generated</th>
            <th>Integrity</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {exports.map((row) => (
            <tr key={row.export_id}>
              <td>
                <div style={{ fontWeight: 500 }}>{bundleLabel(row.bundle_type)}</div>
                <div className="mono" style={{ fontSize: "0.6875rem", color: "var(--console-fg-subtle)" }}>
                  {row.export_id}
                </div>
              </td>
              <td>
                <StatusBadge status={row.status} />
              </td>
              <td style={{ fontSize: "0.8125rem", whiteSpace: "nowrap" }}>
                {new Date(row.period_start).toLocaleDateString()} –{" "}
                {new Date(row.period_end).toLocaleDateString()}
              </td>
              <td>{row.event_count ?? "—"}</td>
              <td>{formatBytes(row.byte_size)}</td>
              <td style={{ fontSize: "0.8125rem", whiteSpace: "nowrap" }}>
                {row.generated_at
                  ? new Date(row.generated_at).toLocaleString()
                  : "—"}
              </td>
              <td>
                {row.integrity_hash ? (
                  <IntegrityCell hash={row.integrity_hash} />
                ) : (
                  "—"
                )}
              </td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                {row.status === "ready" ? (
                  <button
                    type="button"
                    className={`${ui.btn} ${ui.btnPrimary}`}
                    disabled={downloadingId === row.export_id}
                    onClick={() => onDownload(row)}
                  >
                    <Download size={14} aria-hidden />
                    {downloadingId === row.export_id ? "Saving…" : "Download"}
                  </button>
                ) : (
                  <span style={{ fontSize: "0.75rem", color: "var(--console-fg-subtle)" }}>
                    {row.status}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IntegrityCell({ hash }: { hash: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.35rem",
      }}
    >
      <span
        className="mono"
        style={{ fontSize: "0.6875rem" }}
        title={hash}
      >
        {hash.slice(0, 10)}…
      </span>
      <CopyButton text={hash} label="Copy hash" iconOnly />
    </div>
  );
}
