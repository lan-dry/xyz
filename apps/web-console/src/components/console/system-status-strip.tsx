"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { consoleApi } from "@/lib/api";
import { ui } from "./console-ui";

type ServiceStatus = {
  state: "inactive" | "active" | "attention";
  label: string;
  last_run_at: string | null;
};

type SystemStatus = {
  witness: {
    state: "ok" | "degraded" | "unknown";
    label: string;
    detail: string;
    last_batch_at: string | null;
    pending_events: number;
    merkle_roots_total: number;
  };
  services: {
    scheduled_exports: ServiceStatus;
    maintenance: ServiceStatus;
  };
};

function dotColor(state: "ok" | "degraded" | "unknown"): string {
  if (state === "ok") return "var(--console-success, #16a34a)";
  if (state === "degraded") return "var(--console-warning, #ca8a04)";
  return "var(--console-fg-muted)";
}

function serviceLine(name: string, svc: ServiceStatus): string {
  if (svc.last_run_at && svc.state === "active") {
    return `${name}: ${svc.label} · ${new Date(svc.last_run_at).toLocaleString()}`;
  }
  return `${name}: ${svc.label}`;
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

  const { witness, services } = data.status;
  const showWarning = witness.state === "degraded";

  const metaParts: string[] = [];
  if (witness.merkle_roots_total > 0) {
    metaParts.push(`Merkle roots: ${witness.merkle_roots_total}`);
  }
  if (witness.last_batch_at) {
    metaParts.push(
      `Last batch: ${new Date(witness.last_batch_at).toLocaleString()}`,
    );
  }
  metaParts.push(serviceLine("Scheduled exports", services.scheduled_exports));
  metaParts.push(serviceLine("Maintenance", services.maintenance));

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
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "1rem",
          fontSize: "0.75rem",
          color: "var(--console-fg-subtle)",
        }}
      >
        {metaParts.map((part) => (
          <span key={part}>{part}</span>
        ))}
        <Link href="/aegis/exports" className={ui.tableLink}>
          Exports
        </Link>
      </div>
    </div>
  );
}
