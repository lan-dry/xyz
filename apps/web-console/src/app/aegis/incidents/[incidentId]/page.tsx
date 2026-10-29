"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  ConsolePage,
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  StatusBadge,
  ui,
} from "@/components/console/console-ui";
import { consoleApi } from "@/lib/api";

type IncidentDetail = {
  incident_id: string;
  title: string;
  severity: string;
  status: string;
  summary: string | null;
  trace_id: string | null;
  event_id: string | null;
  created_at: string;
};

type Note = { note_id: string; body: string; created_at: string };

type SimulateReport = {
  days: number;
  scanned: number;
  flipped: number;
  would_allow: number;
  would_ask: number;
  would_stop: number;
  examples: Array<{
    event_id: string;
    trace_id: string;
    tool_name: string | null;
    historical_decision: string;
    today_decision: string;
    reason: string | null;
  }>;
};

export default function IncidentDetailPage() {
  const params = useParams();
  const incidentId = String(params.incidentId ?? "");
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");

  const detailQuery = useQuery({
    queryKey: ["console", "incidents", incidentId],
    queryFn: () =>
      consoleApi<{ incident: IncidentDetail; notes: Note[] }>(
        `/incidents/${encodeURIComponent(incidentId)}`,
      ),
    enabled: Boolean(incidentId),
  });

  const simulateQuery = useQuery({
    queryKey: ["console", "policy-simulate", 90],
    queryFn: () =>
      consoleApi<{ report: SimulateReport }>("/policy/simulate?days=90"),
  });

  const addNote = useMutation({
    mutationFn: () =>
      consoleApi(`/incidents/${encodeURIComponent(incidentId)}/notes`, {
        method: "POST",
        body: JSON.stringify({ body: note }),
      }),
    onSuccess: () => {
      setNote("");
      void queryClient.invalidateQueries({
        queryKey: ["console", "incidents", incidentId],
      });
    },
  });

  const setStatus = useMutation({
    mutationFn: (status: string) =>
      consoleApi(`/incidents/${encodeURIComponent(incidentId)}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["console", "incidents", incidentId],
      });
    },
  });

  const incident = detailQuery.data?.incident;
  const notes = detailQuery.data?.notes ?? [];
  const report = simulateQuery.data?.report;

  return (
    <ConsolePage>
      <PageHeader
        title={incident?.title ?? "Incident"}
        subtitle={incident?.summary ?? "Loading..."}
        actions={
          <Link href="/aegis/incidents" className={`${ui.btn} ${ui.btnGhost}`}>
            All incidents
          </Link>
        }
      />

      {detailQuery.isPending ? <LoadingBlock /> : null}
      {detailQuery.error ? <ErrorAlert message="Incident not found." /> : null}

      {incident ? (
        <div className={ui.twoCol}>
          <section className={`${ui.card} ${ui.cardPad}`}>
            <h2 className={ui.panelTitle}>Case links</h2>
            <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem" }}>
              <StatusBadge status={incident.severity} />{" "}
              <StatusBadge status={incident.status} />
            </p>
            {incident.trace_id ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                <Link
                  href={`/aegis/traces/${encodeURIComponent(incident.trace_id)}`}
                  className={`${ui.btn} ${ui.btnPrimary}`}
                >
                  Open case
                </Link>
                <Link
                  href={`/aegis/traces/${encodeURIComponent(incident.trace_id)}/replay`}
                  className={`${ui.btn} ${ui.btnSecondary}`}
                >
                  Replay
                </Link>
              </div>
            ) : (
              <p className={ui.cardHint}>
                No linked trace yet. Attach from a denied payout in Live feed.
              </p>
            )}
            <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {["investigating", "resolved", "closed"].map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`${ui.btn} ${ui.btnGhost}`}
                  disabled={setStatus.isPending}
                  onClick={() => setStatus.mutate(s)}
                >
                  Mark {s}
                </button>
              ))}
            </div>
          </section>

          <section className={`${ui.card} ${ui.cardPad}`}>
            <h2 className={ui.panelTitle}>Policy today (90 days)</h2>
            {simulateQuery.isPending ? <LoadingBlock /> : null}
            {report ? (
              <>
                <p className={ui.cardHint} style={{ marginTop: 0 }}>
                  Scanned {report.scanned} events. {report.flipped} would decide differently
                  under current policies ({report.would_allow} allow / {report.would_ask} ask /{" "}
                  {report.would_stop} stop).
                </p>
                {report.examples.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.8125rem" }}>
                    {report.examples.slice(0, 5).map((ex) => (
                      <li key={ex.event_id} style={{ marginBottom: "0.35rem" }}>
                        <span className="mono">{ex.tool_name ?? "tool"}</span>:{" "}
                        {ex.historical_decision} → {ex.today_decision}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={ui.cardHint}>No decision flips in this window.</p>
                )}
              </>
            ) : null}
          </section>
        </div>
      ) : null}

      {incident ? (
        <section className={`${ui.card} ${ui.cardPad}`} style={{ marginTop: "1.25rem" }}>
          <h2 className={ui.panelTitle}>Timeline notes</h2>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {notes.map((n) => (
              <li
                key={n.note_id}
                style={{
                  padding: "0.65rem 0",
                  borderTop: "1px solid var(--console-border)",
                  fontSize: "0.875rem",
                }}
              >
                <p style={{ margin: 0 }}>{n.body}</p>
                <p className={ui.cardHint} style={{ margin: "0.25rem 0 0" }}>
                  {new Date(n.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
          <label className={ui.field} style={{ marginTop: "0.75rem" }}>
            Add note
            <textarea
              className={ui.input}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnPrimary}`}
            style={{ marginTop: "0.5rem" }}
            disabled={!note.trim() || addNote.isPending}
            onClick={() => addNote.mutate()}
          >
            Save note
          </button>
        </section>
      ) : null}
    </ConsolePage>
  );
}
