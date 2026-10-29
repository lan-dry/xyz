"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { stepTitlePlain } from "@/lib/case-story";

import styles from "./replay.module.css";

type ReplayStep = {
  step_index: number;
  event_id: string;
  span_id: string | null;
  action_kind: string;
  policy_decision: string;
  tool_name: string | null;
  summary: string;
  emitted_at: string | null;
  payload_preview: Record<string, unknown> | null;
  mode: "audit" | "local_rerun";
  local_hint: string | null;
};

type ReplayManifest = {
  trace_id: string;
  step_count: number;
  reconstruction_ms: number;
  steps: ReplayStep[];
  disclaimer: string;
};

const STEP_MS = 2_400;

export default function TraceReplayPage() {
  const params = useParams<{ traceId: string }>();
  const traceId = decodeURIComponent(params.traceId);
  const [stepIndex, setStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [animating, setAnimating] = useState(false);
  const playTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["console", "trace-replay", traceId],
    queryFn: () =>
      consoleApi<ReplayManifest>(
        `/traces/${encodeURIComponent(traceId)}/replay`,
      ),
  });

  const step = data?.steps[stepIndex];
  const stepCount = data?.steps.length ?? 0;
  const progressPct =
    stepCount > 1 ? (stepIndex / (stepCount - 1)) * 100 : stepCount === 1 ? 100 : 0;

  const clearPlayTimer = useCallback(() => {
    if (playTimer.current) {
      clearTimeout(playTimer.current);
      playTimer.current = null;
    }
  }, []);

  const goToStep = useCallback(
    (index: number) => {
      setAnimating(true);
      setStepIndex(index);
      window.setTimeout(() => setAnimating(false), 320);
    },
    [],
  );

  const playFrom = useCallback(
    (startIndex: number) => {
      clearPlayTimer();
      setIsPlaying(true);
      goToStep(startIndex);

      const scheduleNext = (current: number) => {
        if (!data || current >= data.steps.length - 1) {
          setIsPlaying(false);
          return;
        }
        playTimer.current = setTimeout(() => {
          const next = current + 1;
          goToStep(next);
          scheduleNext(next);
        }, STEP_MS);
      };

      if (startIndex < (data?.steps.length ?? 0) - 1) {
        scheduleNext(startIndex);
      } else {
        setIsPlaying(false);
      }
    },
    [clearPlayTimer, data, goToStep],
  );

  useEffect(() => () => clearPlayTimer(), [clearPlayTimer]);

  return (
    <ConsolePage>
      <BackLink href={`/aegis/traces/${encodeURIComponent(traceId)}`}>
        ← Case
      </BackLink>
      {isLoading ? <LoadingBlock /> : null}
      {error ? <ErrorAlert message="Failed to load replay manifest." /> : null}
      {data && step ? (
        <>
          <PageHeader
            title="Watch what happened"
            subtitle="Walk the sealed record like a story. Nothing is run again. This only rebuilds what was already signed."
          />
          <p
            style={{
              margin: "0 0 1rem",
              fontSize: "0.8125rem",
              color: "var(--console-fg-muted)",
            }}
          >
            Rebuilt from <strong>{data.step_count}</strong> sealed record(s)
            {data.reconstruction_ms != null ? (
              <>
                {" "}
                in <strong>{data.reconstruction_ms}ms</strong>
              </>
            ) : null}
            . Step {step.step_index} of {data.step_count}.
          </p>

          <div className={styles.playbackBar} aria-hidden>
            <div
              className={styles.playbackFill}
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className={`${ui.alert} ${ui.alertSuccess}`} style={{ marginBottom: "1rem" }}>
            Watching a case uses the sealed record. Nothing is executed again on Salanor
            servers.
          </div>

          <div className={styles.layout}>
            <div className={`${ui.card} ${ui.cardPad} ${styles.timelineCard}`}>
              <p
                style={{
                  margin: "0 0 0.75rem",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "var(--console-fg-subtle)",
                }}
              >
                Timeline
              </p>
              <div className={styles.timeline}>
                <div className={styles.timelineTrack} aria-hidden>
                  <div
                    className={styles.timelineProgress}
                    style={{ height: `${progressPct}%` }}
                  />
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {data.steps.map((s, i) => {
                    const active = i === stepIndex;
                    const done = i < stepIndex;
                    return (
                      <li key={s.event_id}>
                        <button
                          type="button"
                          className={`${styles.stepButton} ${active ? styles.stepActive : ""}`}
                          onClick={() => {
                            clearPlayTimer();
                            setIsPlaying(false);
                            goToStep(i);
                          }}
                        >
                          <span
                            className={`${styles.stepDot} ${active ? styles.stepDotActive : ""} ${done ? styles.stepDotDone : ""}`}
                            aria-hidden
                          />
                          <span className={styles.stepLabel}>
                            {s.step_index}.{" "}
                            {stepTitlePlain(
                              s.action_kind,
                              s.tool_name,
                              s.policy_decision,
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            <div
              className={`${ui.card} ${ui.cardPad} ${styles.detailPanel} ${animating ? styles.detailExit : styles.detailEnter}`}
            >
              <p
                style={{
                  margin: "0 0 0.5rem",
                  fontSize: "0.875rem",
                  color: "var(--console-fg-subtle)",
                }}
              >
                Step {step.step_index} of {data.step_count}
              </p>
              <h2 className={ui.panelTitle} style={{ marginTop: 0 }}>
                {stepTitlePlain(
                  step.action_kind,
                  step.tool_name,
                  step.policy_decision,
                )}
              </h2>
              <p style={{ margin: "0.5rem 0" }}>
                <StatusBadge status={step.policy_decision} />
              </p>
              {step.emitted_at ? (
                <p style={{ fontSize: "0.8125rem", color: "var(--console-fg-muted)" }}>
                  {new Date(step.emitted_at).toLocaleString()}
                </p>
              ) : null}
              {step.summary ? (
                <p style={{ margin: "0.75rem 0 0", fontSize: "0.875rem", lineHeight: 1.5 }}>
                  {step.summary}
                </p>
              ) : null}
              <Link
                href={`/aegis/events/${encodeURIComponent(step.event_id)}`}
                className={`${ui.btn} ${ui.btnSecondary}`}
                style={{ marginTop: "1rem", display: "inline-flex" }}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open signed event
              </Link>
              <details style={{ marginTop: "1rem" }}>
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    color: "var(--console-fg-subtle)",
                  }}
                >
                  Advanced (engineers)
                </summary>
                <p
                  style={{
                    margin: "0.5rem 0 0",
                    fontSize: "0.8125rem",
                    color: "var(--console-fg-muted)",
                  }}
                >
                  {step.mode === "audit"
                    ? "Audit view only. Sealed record. Nothing is re-executed here."
                    : "Re-execution is not run in the cloud. Use your agent runtime locally with the same signing keys if you need a local re-run."}
                </p>
                {step.payload_preview ? (
                  <pre className={`mono ${styles.payloadPre}`} style={{ marginTop: "0.5rem" }}>
                    {JSON.stringify(step.payload_preview, null, 2)}
                  </pre>
                ) : null}
                {step.local_hint ? (
                  <p
                    className="mono"
                    style={{
                      margin: "0.35rem 0 0",
                      fontSize: "0.75rem",
                      color: "var(--console-fg-subtle)",
                    }}
                  >
                    {step.local_hint}
                  </p>
                ) : null}
                {step.span_id ? (
                  <p className="mono" style={{ fontSize: "0.75rem", margin: "0.35rem 0 0" }}>
                    span_id: {step.span_id}
                  </p>
                ) : null}
                <p className="mono" style={{ fontSize: "0.75rem", margin: "0.35rem 0 0" }}>
                  {step.action_kind}
                  {step.tool_name ? ` · ${step.tool_name}` : ""}
                </p>
              </details>
            </div>
          </div>

          <div className={styles.controls}>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              onClick={() => {
                if (isPlaying) {
                  clearPlayTimer();
                  setIsPlaying(false);
                } else {
                  const atEnd = stepIndex >= stepCount - 1;
                  playFrom(atEnd ? 0 : stepIndex);
                }
              }}
            >
              {isPlaying ? (
                <>
                  <Pause size={16} aria-hidden /> Pause
                </>
              ) : (
                <>
                  <Play size={16} aria-hidden />{" "}
                  {stepIndex >= stepCount - 1 ? "Watch from start" : "Play"}
                </>
              )}
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              disabled={stepIndex <= 0}
              onClick={() => {
                clearPlayTimer();
                setIsPlaying(false);
                goToStep(Math.max(0, stepIndex - 1));
              }}
            >
              <SkipBack size={16} aria-hidden /> Previous
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              disabled={stepIndex >= stepCount - 1}
              onClick={() => {
                clearPlayTimer();
                setIsPlaying(false);
                goToStep(Math.min(stepCount - 1, stepIndex + 1));
              }}
            >
              <SkipForward size={16} aria-hidden /> Next
            </button>
            {isPlaying ? (
              <span className={styles.playingLabel}>Playing step {stepIndex + 1}…</span>
            ) : null}
          </div>
        </>
      ) : null}
    </ConsolePage>
  );
}
