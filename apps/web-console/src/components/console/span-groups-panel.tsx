import Link from "next/link";

import { StatusBadge, ui } from "@/components/console/console-ui";
import type { EventDetail, EventSpanGroup } from "@/lib/types";

type Props = {
  spans: EventSpanGroup[];
};

export function SpanGroupsPanel({ spans }: Props) {
  if (spans.length === 0) {
    return null;
  }

  return (
    <section style={{ marginBottom: "1.5rem" }}>
      <h2 className={ui.panelTitle}>Spans</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {spans.map((span) => (
          <div key={span.span_id} className={`${ui.card} ${ui.cardPad}`}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "baseline",
                gap: "0.5rem 1rem",
                marginBottom: "0.75rem",
              }}
            >
              <strong style={{ fontSize: "0.9375rem" }}>{span.label}</strong>
              <code className="mono" style={{ fontSize: "0.75rem", color: "var(--console-fg-subtle)" }}>
                {span.span_id}
              </code>
              <span style={{ fontSize: "0.8125rem", color: "var(--console-fg-subtle)" }}>
                {span.events.length} event(s)
              </span>
            </div>
            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Event</th>
                    <th>Kind</th>
                    <th>Policy</th>
                  </tr>
                </thead>
                <tbody>
                  {span.events.map((e: EventDetail) => (
                    <tr key={e.event_id}>
                      <td>{e.sequence_num}</td>
                      <td>
                        <Link
                          href={`/aegis/events/${encodeURIComponent(e.event_id)}`}
                          className={`${ui.tableLink} mono`}
                        >
                          {e.event_id}
                        </Link>
                      </td>
                      <td>{e.action_kind}</td>
                      <td>
                        <StatusBadge status={e.policy_decision} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
