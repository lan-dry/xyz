"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { StatusBadge, ui } from "@/components/console/console-ui";
import { TruncatedId } from "@/components/console/truncated-id";
import { isBookkeepingAction } from "@/lib/outcome-vocab";
import { stepTitlePlain } from "@/lib/case-story";
import type { EventDetail, SpanTreeNode } from "@/lib/types";

type SpanTimelineEvent = SpanTreeNode["events"][number] & {
  chain_valid?: boolean;
};

import styles from "./span-tree-panel.module.css";

function SpanEventRow({ event }: { event: SpanTimelineEvent }) {
  const title = stepTitlePlain(
    event.action_kind,
    event.tool_name,
    event.policy_decision,
  );
  return (
    <li className={styles.eventRow}>
      <Link
        href={`/aegis/events/${encodeURIComponent(event.event_id)}`}
        className={ui.tableLink}
        style={{ fontWeight: 500, fontSize: "0.875rem" }}
      >
        {title}
      </Link>
      <StatusBadge status={event.policy_decision} />
      <span className={styles.eventMeta} title={event.emitted_at}>
        {new Date(event.emitted_at).toLocaleTimeString()}
      </span>
      <span className={styles.eventMeta} title="Technical id: Show details">
        <TruncatedId value={event.event_id} head={6} tail={4} />
      </span>
      {event.chain_valid === false ? <StatusBadge status="failed" /> : null}
    </li>
  );
}

function spanPlainLabel(node: SpanTreeNode): string {
  const kinds = node.events.map((e) => e.action_kind);
  if (kinds.includes("policy_decision") && node.events.some((e) => e.tool_name?.includes("stripe"))) {
    return "Payment tool";
  }
  if (kinds.includes("llm_invocation")) return "Agent decision";
  if (node.events.some((e) => e.tool_name?.includes("trace.start"))) return "Ticket intake";
  if (node.events.some((e) => e.tool_name?.includes("trace.complete"))) return "Session complete";
  return node.label?.replace(/^aegis\./, "") || "Step";
}

function SpanNode({ node, depth }: { node: SpanTreeNode; depth: number }) {
  const meaningful = node.events.filter(
    (e) => !isBookkeepingAction(e.action_kind, e.tool_name),
  );
  const bookkeeping = node.events.filter((e) =>
    isBookkeepingAction(e.action_kind, e.tool_name),
  );
  const showEvents = meaningful.length > 0 ? meaningful : node.events;

  return (
    <div
      style={{
        marginLeft: depth ? `${depth * 1.25}rem` : 0,
        marginBottom: "0.75rem",
      }}
    >
      <div className={`${ui.card} ${ui.cardPad} ${styles.spanCard}`}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5rem 1rem",
            alignItems: "baseline",
            marginBottom: showEvents.length ? "0.5rem" : 0,
          }}
        >
          <strong>{spanPlainLabel(node)}</strong>
          <StatusBadge status={node.status} />
          <span style={{ fontSize: "0.8125rem", color: "var(--console-fg-subtle)" }}>
            {showEvents.length} step(s)
            {node.child_spans.length
              ? ` · ${node.child_spans.length} nested`
              : ""}
          </span>
        </div>
        {showEvents.length > 0 ? (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {showEvents.map((e) => (
              <SpanEventRow key={e.event_id} event={e} />
            ))}
          </ul>
        ) : (
          <p className={styles.eventMeta} style={{ margin: 0 }}>
            No steps linked here yet.
          </p>
        )}
        {bookkeeping.length > 0 && meaningful.length > 0 ? (
          <details style={{ marginTop: "0.65rem" }}>
            <summary
              style={{
                cursor: "pointer",
                fontSize: "0.75rem",
                color: "var(--console-fg-subtle)",
              }}
            >
              System steps ({bookkeeping.length})
            </summary>
            <ul style={{ margin: "0.5rem 0 0", padding: 0, listStyle: "none" }}>
              {bookkeeping.map((e) => (
                <SpanEventRow key={e.event_id} event={e} />
              ))}
            </ul>
          </details>
        ) : null}
      </div>
      {node.child_spans.map((child) => (
        <SpanNode key={child.span_id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

function partitionOrphans(orphanEvents: Array<EventDetail | SpanTimelineEvent>) {
  const bookkeeping: SpanTimelineEvent[] = [];
  const followUp: SpanTimelineEvent[] = [];
  for (const e of orphanEvents) {
    const row = e as SpanTimelineEvent;
    if (isBookkeepingAction(row.action_kind, row.tool_name)) {
      bookkeeping.push(row);
    } else {
      followUp.push(row);
    }
  }
  return { bookkeeping, followUp };
}

export function SpanTreePanel({
  tree,
  orphanEvents = [],
}: {
  tree: SpanTreeNode[];
  orphanEvents?: EventDetail[] | SpanTimelineEvent[];
}) {
  const [showSystem, setShowSystem] = useState(false);
  const { bookkeeping, followUp } = useMemo(
    () => partitionOrphans(orphanEvents),
    [orphanEvents],
  );

  if (tree.length === 0 && orphanEvents.length === 0) {
    return null;
  }

  return (
    <section style={{ marginBottom: "1.5rem" }}>
      <h2 className={ui.panelTitle}>Timeline of steps</h2>
      <p className={styles.intro}>
        Meaningful steps in order. Bookkeeping (case opened / closed) is folded under System
        steps. Every step is sealed: open an id only when you need the raw record.
      </p>
      {tree.map((node) => (
        <SpanNode key={node.span_id} node={node} depth={0} />
      ))}
      {followUp.length > 0 ? (
        <div className={styles.orphanSection}>
          <h3 className={ui.panelTitle} style={{ fontSize: "0.9375rem" }}>
            Approval and outcome
          </h3>
          <div className={`${ui.card} ${ui.cardPad}`}>
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {followUp.map((e) => (
                <SpanEventRow key={e.event_id} event={e} />
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      {bookkeeping.length > 0 ? (
        <div className={styles.orphanSection}>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnGhost}`}
            style={{ fontSize: "0.8125rem", padding: "0.25rem 0.5rem" }}
            onClick={() => setShowSystem((v) => !v)}
          >
            {showSystem ? "Hide" : "Show"} system steps ({bookkeeping.length})
          </button>
          {showSystem ? (
            <div className={`${ui.card} ${ui.cardPad}`} style={{ marginTop: "0.5rem" }}>
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {bookkeeping.map((e) => (
                  <SpanEventRow key={e.event_id} event={e} />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
