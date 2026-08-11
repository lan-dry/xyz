"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { consoleApi } from "@/lib/api";
import { ui } from "./console-ui";

type SystemStatus = {
  witness: {
    state: "ok" | "degraded" | "unknown";
    label: string;
    detail: string;
    last_batch_at: string | null;
    pending_events: number;
    merkle_roots_total: number;
  };
  workers: {
    compliance: { last_run_at: string | null; label: string };
    housekeeping: { last_run_at: string | null; label: string };
  };
};

function dotColor(state: "ok" | "degraded" | "unknown"): string {
  if (state === "ok") return "var(--console-success, #16a34a)";
  if (state === "degraded") return "var(--console-warning, #ca8a04)";
  return "var(--console-fg-muted)";
}

export function SystemStatusStrip() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["console", "system-status"],
    queryFn: () => consoleApi<{ status: SystemStatus }>("/system-status"),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div
        className={`${ui.alert}`}
        style={{ marginBottom: "1rem", fontSize: "0.8125rem" }}
      >
        Checking platform status…
      </div>
    );
  }

  if (isError || !data?.status) {
    return null;
  }

  const { witness, workers } = data.status;

  return (
    <div
      className={`${ui.alert} ${witness.state === "ok" ? ui.alertSuccess : ui.alert}`}
      style={{
        marginBottom: "1rem",
        display: "grid",
        gap: "0.65rem",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: dotColor(witness.state),
            }}
          />
          <strong>{witness.label}</strong>
        </span>
        <span style={{ fontSize: "0.8125rem", color: "var(--console-fg-muted)" }}>
          {witness.detail}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "1rem",
          fontSize: "0.75rem",
          color: "var(--console-fg-subtle)",
        }}
      >
        <span>
          Merkle roots: <strong>{witness.merkle_roots_total}</strong>
        </span>
        {witness.last_batch_at ? (
          <span>
            Last batch: {new Date(witness.last_batch_at).toLocaleString()}
          </span>
        ) : null}
        <span>
          Compliance worker: {workers.compliance.label}
          {workers.compliance.last_run_at
            ? ` · ${new Date(workers.compliance.last_run_at).toLocaleDateString()}`
            : ""}
        </span>
        <span>
          Housekeeping: {workers.housekeeping.label}
          {workers.housekeeping.last_run_at
            ? ` · ${new Date(workers.housekeeping.last_run_at).toLocaleDateString()}`
            : ""}
        </span>
        <Link href="/aegis/exports" className={ui.tableLink}>
          Exports →
        </Link>
      </div>
    </div>
  );
}
