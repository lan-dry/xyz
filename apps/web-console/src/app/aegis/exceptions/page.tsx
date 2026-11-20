"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AegisMark } from "@/components/console/aegis-mark";
import { EmptyStatePanel } from "@/components/console/empty-state-panel";
import { ConsoleTime } from "@/components/console/console-time";
import { Modal } from "@/components/console/modal";
import {
  ConsolePage,
  ConsolePagination,
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  StatusBadge,
  ui,
} from "@/components/console/console-ui";
import { ApiError, consoleApi } from "@/lib/api";

type ExceptionRow = {
  exception_id: string;
  kind: string;
  severity: string;
  title: string;
  source_name: string | null;
  case_id: string | null;
  status: "open" | "acknowledged" | "resolved";
  first_seen_at: string;
  acknowledge_note: string | null;
  resolve_note: string | null;
  detail?: Record<string, unknown> | null;
};

type StatusFilter = "all" | "open" | "acknowledged" | "resolved";

const PAGE_SIZES = [10, 25, 50, 100] as const;

export default function ExceptionsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>("open");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [actionFor, setActionFor] = useState<{
    row: ExceptionRow;
    action: "acknowledge" | "resolve";
  } | null>(null);
  const [note, setNote] = useState("");

  const listQuery = useQuery({
    queryKey: ["console", "exceptions", status, page, limit],
    queryFn: () =>
      consoleApi<{
        exceptions: ExceptionRow[];
        total?: number;
        page?: number;
        limit?: number;
        error?: string;
      }>(`/exceptions?status=${status}&page=${page}&limit=${limit}`),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!actionFor) return;
      const path =
        actionFor.action === "acknowledge"
          ? `/exceptions/${encodeURIComponent(actionFor.row.exception_id)}/acknowledge`
          : `/exceptions/${encodeURIComponent(actionFor.row.exception_id)}/resolve`;
      return consoleApi(path, {
        method: "POST",
        body: JSON.stringify({ note }),
      });
    },
    onSuccess: async () => {
      setActionFor(null);
      setNote("");
      await queryClient.invalidateQueries({ queryKey: ["console", "exceptions"] });
    },
  });

  const exceptions = listQuery.data?.exceptions ?? [];
  const total = listQuery.data?.total ?? exceptions.length;
  const errorMessage = useMemo(() => {
    if (listQuery.error instanceof ApiError) return listQuery.error.message;
    if (listQuery.error) return "Failed to load exceptions.";
    return null;
  }, [listQuery.error]);

  return (
    <ConsolePage>
      <PageHeader
        title="Exceptions"
        subtitle="Gaps between what Aegis sealed and what the ledger or source systems reported. Acknowledge or resolve with a note."
        actions={
          <select
            className={ui.select}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as StatusFilter);
              setPage(1);
            }}
            aria-label="Filter by status"
          >
            <option value="open">Open</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>
        }
      />

      {listQuery.isPending ? <LoadingBlock /> : null}
      {errorMessage ? <ErrorAlert message={errorMessage} /> : null}

      {!listQuery.isPending && !listQuery.error && total === 0 ? (
        <EmptyStatePanel
          mark={<AegisMark />}
          title="No exceptions"
          description="A clean reconciliation run leaves this list empty."
          action={
            <Link href="/aegis/reports" className={`${ui.btn} ${ui.btnSecondary}`}>
              <AlertTriangle size={14} aria-hidden /> Reports
            </Link>
          }
        />
      ) : null}

      {exceptions.length > 0 ? (
        <>
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Exception</th>
                  <th>Severity</th>
                  <th>Source</th>
                  <th>Case</th>
                  <th>First seen</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {exceptions.map((ex) => (
                  <tr key={ex.exception_id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{ex.title}</div>
                      <p className={ui.cardHint} style={{ margin: "0.25rem 0 0" }}>
                        {ex.kind}
                        {ex.kind === "db_value_mismatch" &&
                        typeof (ex.detail as { contradicted_at?: unknown } | null)
                          ?.contradicted_at === "string" ? (
                          <>
                            {" "}
                            · contradicted on{" "}
                            {String(
                              (ex.detail as { contradicted_at: string }).contradicted_at,
                            )
                              .replace("T", " ")
                              .replace(/\.\d{3}Z$/, " UTC")}
                          </>
                        ) : null}
                      </p>
                    </td>
                    <td>
                      <StatusBadge status={ex.severity} />
                    </td>
                    <td>{ex.source_name ?? "-"}</td>
                    <td>
                      {ex.case_id ? (
                        <Link
                          href={`/aegis/traces?q=${encodeURIComponent(ex.case_id)}`}
                          className={ui.tableLink}
                        >
                          {ex.case_id}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      <ConsoleTime iso={ex.first_seen_at} />
                    </td>
                    <td>
                      <StatusBadge status={ex.status} />
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                        {ex.status === "open" ? (
                          <button
                            type="button"
                            className={`${ui.btn} ${ui.btnSecondary}`}
                            onClick={() => {
                              setNote("");
                              setActionFor({ row: ex, action: "acknowledge" });
                            }}
                          >
                            Acknowledge
                          </button>
                        ) : null}
                        {ex.status !== "resolved" ? (
                          <button
                            type="button"
                            className={`${ui.btn} ${ui.btnPrimary}`}
                            onClick={() => {
                              setNote("");
                              setActionFor({ row: ex, action: "resolve" });
                            }}
                          >
                            Resolve
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ConsolePagination
            total={total}
            limit={limit}
            page={page}
            onPageChange={setPage}
            onLimitChange={(n) => {
              setLimit(n);
              setPage(1);
            }}
            noun="exception"
            pageSizes={[...PAGE_SIZES]}
          />
        </>
      ) : null}

      <Modal
        open={Boolean(actionFor)}
        onClose={() => {
          if (!mutation.isPending) {
            setActionFor(null);
            setNote("");
          }
        }}
        title={
          actionFor?.action === "acknowledge"
            ? "Acknowledge exception"
            : "Resolve exception"
        }
      >
        {actionFor ? (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <p className={ui.cardHint} style={{ margin: 0 }}>
              {actionFor.row.title}
            </p>
            <label className={ui.field}>
              Note
              <textarea
                className={ui.textarea}
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What did you check, and what happens next?"
              />
            </label>
            {mutation.error ? (
              <ErrorAlert
                message={
                  mutation.error instanceof ApiError
                    ? mutation.error.message
                    : "Could not update exception."
                }
              />
            ) : null}
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnSecondary}`}
                disabled={mutation.isPending}
                onClick={() => {
                  setActionFor(null);
                  setNote("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnPrimary}`}
                disabled={mutation.isPending || !note.trim()}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? "Saving…" : "Record note"}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </ConsolePage>
  );
}
