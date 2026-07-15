import Link from "next/link";

import { EventPhaseBadge } from "@/components/console/event-phase-badge";
import { StatusBadge, ui } from "@/components/console/console-ui";
import { TruncatedId } from "@/components/console/truncated-id";
import { eventPhaseHint } from "@/lib/event-phase";
import type { EventDetail, SpanTreeNode } from "@/lib/types";

type SpanTimelineEvent = SpanTreeNode["events"][number] & {
  chain_valid?: boolean;
};

import styles from "./span-tree-panel.module.css";

function SpanEventRow({ event }: { event: SpanTimelineEvent }) {
  return (
    <li className={styles.eventRow}>
      <EventPhaseBadge actionKind={event.action_kind} />
      <Link
        href={`/aegis/events/${encodeURIComponent(event.event_id)}`}
        className={`${ui.tableLink}`}
        style={{ fontWeight: 500, fontSize: "0.875rem" }}
      >
        #{event.sequence_num} {event.action_kind}
      </Link>
      <StatusBadge status={event.policy_decision} />
      {event.tool_name ? (
        <span className={`mono ${styles.eventMeta}`}>{event.tool_name}</span>
      ) : null}
      <span className={styles.eventMeta} title={eventPhaseHint(event.action_kind)}>
        <TruncatedId value={event.event_id} head={6} tail={4} />
      </span>
      {event.chain_valid === false ? <StatusBadge status="failed" /> : null}
    </li>
  );
}

function SpanNode({ node, depth }: { node: SpanTreeNode; depth: number }) {
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
            marginBottom: node.events.length ? "0.5rem" : 0,
          }}
        >
          <strong>{node.label ?? "Span"}</strong>
          <TruncatedId value={node.span_id} head={8} tail={6} />
          <StatusBadge status={node.status} />
          <span style={{ fontSize: "0.8125rem", color: "var(--console-fg-subtle)" }}>
            {node.events.length} atomic event(s)
            {node.child_spans.length
              ? ` · ${node.child_spans.length} nested span(s)`
              : ""}
          </span>
        </div>
        {node.events.length > 0 ? (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {node.events.map((e) => (
              <SpanEventRow key={e.event_id} event={e} />
            ))}
          </ul>
        ) : (
          <p className={styles.eventMeta} style={{ margin: 0 }}>
            No events linked to this span yet.
          </p>
        )}
      </div>
      {node.child_spans.map((child) => (
        <SpanNode key={child.span_id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function SpanTreePanel({
  tree,
  orphanEvents = [],
}: {
  tree: SpanTreeNode[];
  orphanEvents?: EventDetail[] | SpanTimelineEvent[];
}) {
  if (tree.length === 0 && orphanEvents.length === 0) {
    return null;
  }

  return (
    <section style={{ marginBottom: "1.5rem" }}>
      <h2 className={ui.panelTitle}>Trace timeline</h2>
      <p className={styles.intro}>
        A <strong>trace</strong> is one agent session. <strong>Spans</strong> group steps (tool,
        LLM, decision). Each row below is an atomic <strong>event</strong> — input, output, policy,
        or governance — signed and chained (Ed25519, APS-1).
      </p>
      {tree.map((node) => (
        <SpanNode key={node.span_id} node={node} depth={0} />
      ))}
      {orphanEvents.length > 0 ? (
        <div className={styles.orphanSection}>
          <h3 className={ui.panelTitle} style={{ fontSize: "0.9375rem" }}>
            Events without a span
          </h3>
          <div className={`${ui.card} ${ui.cardPad}`}>
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {orphanEvents.map((e) => (
                <SpanEventRow key={e.event_id} event={e} />
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}
