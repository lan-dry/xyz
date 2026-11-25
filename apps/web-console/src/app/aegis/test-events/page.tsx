"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ConsolePage,
  ErrorAlert,
  PageHeader,
  ui,
} from "@/components/console/console-ui";
import { ApiError, consoleApi } from "@/lib/api";
import { useSandboxStatus, useTenantCopy } from "@/lib/tenant-copy";
import { ResetSandboxPanel } from "@/components/console/reset-sandbox";
import { SandboxSamples } from "../get-started/checklist";

const SCENARIOS = [
  {
    id: "routine",
    label: "Routine",
    description: "Within limit — expect auto-allow.",
  },
  {
    id: "held",
    label: "Held",
    description: "Above limit — expect hold for approval.",
  },
  {
    id: "override",
    label: "Override",
    description: "Exception path on a held payment.",
  },
  {
    id: "altered_payment",
    label: "Altered payment",
    description: "Anomaly signal: amount changed after approval.",
  },
  {
    id: "split_payment",
    label: "Split payment",
    description: "One transfer split across two demo accounts.",
  },
] as const;

type Sent = {
  ok: boolean;
  delivered?: boolean;
  message: string;
  scenario?: string;
  case_id?: string;
  trace_id?: string;
  outcome?: string;
  event?: unknown;
  response?: unknown;
};

export default function TestEventsPage() {
  const copy = useTenantCopy();
  const status = useSandboxStatus();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isSandbox = status.data?.is_sandbox === true;

  useEffect(() => {
    if (status.isSuccess && status.data && !status.data.is_sandbox) {
      router.replace("/aegis");
    }
  }, [status.isSuccess, status.data, router]);

  const send = useMutation({
    mutationFn: (scenario: string) =>
      consoleApi<Sent>("/sandbox/test-events", {
        method: "POST",
        body: JSON.stringify({ scenario }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["console", "sandbox", "status"] });
      void queryClient.invalidateQueries({ queryKey: ["console", "traces"] });
      void queryClient.invalidateQueries({ queryKey: ["console", "overview"] });
      void queryClient.invalidateQueries({ queryKey: ["console", "approvals"] });
    },
  });

  if (status.isLoading || status.isPending) {
    return (
      <ConsolePage>
        <PageHeader title="Test sender" subtitle="Checking organisation…" />
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      </ConsolePage>
    );
  }

  if (status.isError) {
    return (
      <ConsolePage>
        <PageHeader title="Test sender" subtitle="Sandbox only." />
        <ErrorAlert message="Could not confirm sandbox status. Try again." />
      </ConsolePage>
    );
  }

  if (!isSandbox) {
    return (
      <ConsolePage>
        <PageHeader title="Test sender" subtitle="Sandbox only." />
        <ErrorAlert message="This page is only available on sandbox organisations." />
        <p style={{ marginTop: "0.75rem" }}>
          <Link href="/aegis" className={ui.tableLink}>
            Back to overview
          </Link>
        </p>
      </ConsolePage>
    );
  }

  return (
    <ConsolePage>
      <PageHeader
        title="Test sender"
        subtitle="One click sends a signed synthetic event into this sandbox. No CLI or external tool."
      />
      <p className={ui.cardHint} style={{ marginTop: 0, marginBottom: "1rem" }}>
        {copy.tooltip_test_event}
      </p>
      <div
        style={{
          display: "grid",
          gap: "0.75rem",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        }}
      >
        {SCENARIOS.map((s) => (
          <div
            key={s.id}
            style={{
              border: "1px solid var(--border, #d5ddd8)",
              borderRadius: 10,
              padding: "1rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{s.label}</div>
              <p
                style={{
                  margin: "0.35rem 0 0",
                  fontSize: 13,
                  lineHeight: 1.45,
                  color: "var(--text-muted)",
                }}
              >
                {s.description}
              </p>
            </div>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              title={copy.tooltip_test_event}
              disabled={send.isPending}
              onClick={() => send.mutate(s.id)}
            >
              {send.isPending && send.variables === s.id ? "Sending…" : "Send"}
            </button>
          </div>
        ))}
      </div>
      {send.error ? (
        <div style={{ marginTop: "1rem" }}>
          <ErrorAlert
            message={
              send.error instanceof ApiError
                ? send.error.message
                : "Could not send the test event."
            }
          />
        </div>
      ) : null}
      {send.data ? (
        <div
          style={{
            marginTop: "1.25rem",
            padding: "1rem",
            border: "1px solid var(--border, #d5ddd8)",
            borderRadius: 10,
            background: "var(--surface, #f7f9f8)",
          }}
        >
          <p style={{ margin: 0 }}>
            {send.data.message}
            {send.data.outcome ? ` Outcome: ${send.data.outcome}.` : null}
          </p>
          <div
            style={{
              marginTop: "0.75rem",
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem 1.25rem",
            }}
          >
            {send.data.trace_id ? (
              <Link
                href={`/aegis/traces/${encodeURIComponent(send.data.trace_id)}`}
                className={ui.tableLink}
              >
                Open sealed case
              </Link>
            ) : null}
            {send.data.case_id ? (
              <Link
                href={
                  send.data.trace_id
                    ? `/aegis/traces/${encodeURIComponent(send.data.trace_id)}`
                    : `/aegis/live?q=${encodeURIComponent(send.data.case_id)}`
                }
                className={ui.tableLink}
              >
                Case {send.data.case_id}
              </Link>
            ) : null}
            <Link href="/aegis/live" className={ui.tableLink}>
              Open Live feed
            </Link>
            {send.data.outcome === "hold" || send.data.outcome === "held" ? (
              <Link href="/aegis/approvals" className={ui.tableLink}>
                Open Approvals
              </Link>
            ) : null}
          </div>
          <details style={{ marginTop: "1rem" }}>
            <summary style={{ cursor: "pointer", fontSize: 13 }}>
              Event and response JSON
            </summary>
            <h3 style={{ fontSize: 13, marginTop: "0.75rem" }}>Event</h3>
            <pre style={{ overflow: "auto", fontSize: 12 }}>
              {JSON.stringify(send.data.event, null, 2)}
            </pre>
            <h3 style={{ fontSize: 13 }}>Response</h3>
            <pre style={{ overflow: "auto", fontSize: 12 }}>
              {JSON.stringify(send.data.response, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}
      <SandboxSamples />
      <div style={{ marginTop: "1rem" }}>
        <ResetSandboxPanel compact />
      </div>
    </ConsolePage>
  );
}
