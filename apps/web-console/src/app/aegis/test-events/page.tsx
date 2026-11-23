"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ConsolePage,
  ErrorAlert,
  PageHeader,
  ui,
} from "@/components/console/console-ui";
import { ApiError, consoleApi } from "@/lib/api";

const SCENARIOS = [
  { id: "routine", label: "Routine loan (expect allow)" },
  { id: "held", label: "Large loan (expect hold)" },
  { id: "g1_claim", label: "Source claim that stays G1 until reconciled" },
] as const;

export default function TestEventsPage() {
  const status = useQuery({
    queryKey: ["console", "sandbox", "status"],
    queryFn: () => consoleApi<{ is_sandbox: boolean }>("/sandbox/status"),
  });
  const send = useMutation({
    mutationFn: (scenario: string) =>
      consoleApi<{
        ok: boolean;
        message: string;
        request: unknown;
        response: unknown;
      }>("/sandbox/test-events", {
        method: "POST",
        body: JSON.stringify({ scenario }),
      }),
  });

  if (status.data && !status.data.is_sandbox) {
    return (
      <ConsolePage>
        <PageHeader
          title="Send test events"
          subtitle="This page is only for sandbox organisations (synthetic data)."
        />
        <ErrorAlert message="Your organisation is not a sandbox. Use a Connector or API key against your own systems." />
      </ConsolePage>
    );
  }

  return (
    <ConsolePage>
      <PageHeader
        title="Send test events"
        subtitle="Sandbox only. Builds a synthetic event you can send through the same public ingest path. The signing key never leaves the server."
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`${ui.btn} ${ui.btnPrimary}`}
            disabled={send.isPending}
            onClick={() => send.mutate(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      {send.error ? (
        <ErrorAlert
          message={
            send.error instanceof ApiError
              ? send.error.message
              : "Could not prepare the test event."
          }
        />
      ) : null}
      {send.data ? (
        <div style={{ marginTop: "1rem" }}>
          <p>{send.data.message}</p>
          <h3>Request</h3>
          <pre style={{ overflow: "auto", fontSize: 12 }}>
            {JSON.stringify(send.data.request, null, 2)}
          </pre>
          <h3>Response</h3>
          <pre style={{ overflow: "auto", fontSize: 12 }}>
            {JSON.stringify(send.data.response, null, 2)}
          </pre>
        </div>
      ) : null}
    </ConsolePage>
  );
}
