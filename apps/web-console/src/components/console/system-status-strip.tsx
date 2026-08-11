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
};

function dotColor(state: "ok" | "degraded" | "unknown"): string {
  if (state === "ok") return "var(--console-success, #16a34a)";
  if (state === "degraded") return "var(--console-warning, #ca8a04)";
  return "var(--console-fg-muted)";
}

function formatLastVerified(iso: string): string {
  const date = new Date(iso);
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (diffMin < 2) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffMin < 24 * 60) {
    const h = Math.floor(diffMin / 60);
    return h === 1 ? "1 hour ago" : `${h} hours ago`;
  }
  return date.toLocaleString();
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
        Checking ledger status…
      </div>
    );
  }

  if (isError || !data?.status) {
    return null;
  }

  const { witness } = data.status;
  const showWarning = witness.state === "degraded";

  return (
    <div
      className={`${ui.alert} ${witness.state === "ok" ? ui.alertSuccess : showWarning ? ui.alert : ui.alert}`}
      style={{
        marginBottom: "1rem",
        display: "grid",
        gap: "0.5rem",
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
      {witness.merkle_roots_total > 0 || witness.last_batch_at ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "1rem",
            fontSize: "0.75rem",
            color: "var(--console-fg-subtle)",
          }}
        >
          {witness.merkle_roots_total > 0 ? (
            <span>
              Verification batches: <strong>{witness.merkle_roots_total}</strong>
            </span>
          ) : null}
          {witness.last_batch_at ? (
            <span>Last verified {formatLastVerified(witness.last_batch_at)}</span>
          ) : null}
          <Link href="/aegis/exports" className={ui.tableLink}>
            Exports
          </Link>
        </div>
      ) : null}
    </div>
  );
}
