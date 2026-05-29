"use client";

import type { GovernanceInsight } from "@/lib/governance-insights";
import { ui } from "@/components/console/console-ui";

const severityStyle: Record<
  GovernanceInsight["severity"],
  { border: string; bg: string }
> = {
  info: {
    border: "var(--console-border)",
    bg: "var(--console-surface)",
  },
  attention: {
    border: "var(--console-accent, #0d9488)",
    bg: "var(--console-accent-soft, rgba(13, 148, 136, 0.08))",
  },
  critical: {
    border: "var(--console-danger, #b91c1c)",
    bg: "rgba(185, 28, 28, 0.06)",
  },
};

type Props = {
  headline: string;
  insights: GovernanceInsight[];
  subtitle?: string;
};

export function GovernanceInsightsPanel({ headline, insights, subtitle }: Props) {
  if (insights.length === 0) {
    return null;
  }

  return (
    <section
      className={`${ui.card} ${ui.cardPad}`}
      style={{ marginBottom: "1.5rem" }}
    >
      <h2 className={ui.panelTitle}>Why this matters</h2>
      <p style={{ margin: "0 0 1rem", fontSize: "0.9375rem", fontWeight: 600 }}>
        {headline}
      </p>
      {subtitle ? (
        <p className={ui.muted} style={{ margin: "0 0 1rem", fontSize: "0.8125rem" }}>
          {subtitle}
        </p>
      ) : null}
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        {insights.map((item) => {
          const style = severityStyle[item.severity];
          return (
            <li
              key={item.id}
              style={{
                border: `1px solid ${style.border}`,
                borderRadius: "8px",
                padding: "0.875rem 1rem",
                background: style.bg,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                <strong style={{ fontSize: "0.875rem" }}>{item.title}</strong>
                {item.metric ? (
                  <span className="mono" style={{ fontSize: "0.75rem", opacity: 0.85 }}>
                    {item.metric}
                  </span>
                ) : null}
              </div>
              <p
                style={{
                  margin: "0.375rem 0 0",
                  fontSize: "0.8125rem",
                  lineHeight: 1.5,
                  color: "var(--console-fg-muted)",
                }}
              >
                {item.detail}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
