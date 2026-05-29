"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  BackLink,
  ConsolePage,
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  StatusBadge,
  ui,
} from "@/components/console/console-ui";
import { consoleApi } from "@/lib/api";

type ReplayStep = {
  step_index: number;
  event_id: string;
  span_id: string | null;
  action_kind: string;
  policy_decision: string;
  tool_name: string | null;
  summary: string;
  mode: "audit" | "local_rerun";
  local_hint: string | null;
};

type ReplayManifest = {
  trace_id: string;
  step_count: number;
  steps: ReplayStep[];
  disclaimer: string;
};

export default function TraceReplayPage() {
  const params = useParams<{ traceId: string }>();
  const traceId = decodeURIComponent(params.traceId);
  const [stepIndex, setStepIndex] = useState(0);

  const { data, isLoading, error } = useQuery({
    queryKey: ["console", "trace-replay", traceId],
    queryFn: () =>
      consoleApi<ReplayManifest>(
        `/traces/${encodeURIComponent(traceId)}/replay`,
      ),
  });

  const step = data?.steps[stepIndex];

  return (
    <ConsolePage>
      <BackLink href={`/aegis/traces/${encodeURIComponent(traceId)}`}>
        ← Trace {traceId}
      </BackLink>
      {isLoading ? <LoadingBlock /> : null}
      {error ? <ErrorAlert message="Failed to load replay manifest." /> : null}
      {data && step ? (
        <>
          <PageHeader
            title="Replay"
            subtitle="Audit walkthrough of signed steps. Side-effectful actions are not re-executed in the cloud."
          />
          <div className={`${ui.alert} ${ui.alertSuccess}`} style={{ marginBottom: "1rem" }}>
            {data.disclaimer}
          </div>
          <div className={`${ui.card} ${ui.cardPad}`} style={{ marginBottom: "1rem" }}>
            <p style={{ margin: "0 0 0.5rem", fontSize: "0.875rem", color: "var(--console-fg-subtle)" }}>
              Step {step.step_index} of {data.step_count}
            </p>
            <h2 className={ui.panelTitle} style={{ marginTop: 0 }}>
              {step.summary}
            </h2>
            <p style={{ margin: "0.5rem 0" }}>
              <StatusBadge status={step.policy_decision} /> · {step.action_kind}
              {step.tool_name ? ` · ${step.tool_name}` : ""}
            </p>
            {step.span_id ? (
              <p className="mono" style={{ fontSize: "0.8125rem", margin: "0.5rem 0 0" }}>
                Span: {step.span_id}
              </p>
            ) : null}
            <p style={{ margin: "0.75rem 0 0" }}>
              Mode: <strong>{step.mode === "audit" ? "Audit only" : "Local re-run required"}</strong>
            </p>
            {step.local_hint ? (
              <p style={{ fontSize: "0.875rem", color: "var(--console-fg-subtle)" }}>
                {step.local_hint}
              </p>
            ) : null}
            <Link
              href={`/aegis/events/${encodeURIComponent(step.event_id)}`}
              className={`${ui.btn} ${ui.btnSecondary}`}
              style={{ marginTop: "1rem", display: "inline-flex" }}
            >
              Open signed event
            </Link>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              disabled={stepIndex <= 0}
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              disabled={stepIndex >= data.steps.length - 1}
              onClick={() =>
                setStepIndex((i) => Math.min(data.steps.length - 1, i + 1))
              }
            >
              Next
            </button>
          </div>
        </>
      ) : null}
    </ConsolePage>
  );
}
