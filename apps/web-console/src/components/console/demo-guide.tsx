"use client";

import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";

import { ui } from "./console-ui";

const STEPS = [
  {
    id: "ingest",
    label: "Ingest a signed event",
    hint: "pnpm demo:ingest (after API key in .env)",
    href: "/aegis/keys",
  },
  {
    id: "trace",
    label: "Open trace & verify event",
    hint: "Event detail → Verify chain + inclusion",
    href: "/aegis/traces",
  },
  {
    id: "policy",
    label: "Create & activate a policy",
    hint: "Deny a tool or set $ max per tx / daily total",
    href: "/aegis/policies",
  },
  {
    id: "approval",
    label: "Human approval (if obligation)",
    hint: "pnpm demo:approval when configured",
    href: "/aegis/approvals",
  },
  {
    id: "members",
    label: "Invite teammate & change role",
    hint: "Members → invite → role dropdown",
    href: "/aegis/members",
  },
  {
    id: "export",
    label: "Compliance export",
    hint: "SOC 2 / EU AI Act bundle (worker + COMPLIANCE_EXPORT_DIR)",
    href: "/aegis/exports",
  },
] as const;

export function DemoGuidePanel({ tracesCount }: { tracesCount: number }) {
  const done = new Set<string>();
  if (tracesCount > 0) {
    done.add("ingest");
    done.add("trace");
  }

  return (
    <section className={`${ui.card} ${ui.cardPad}`}>
      <h2 className={ui.panelTitle}>Partner demo checklist</h2>
      <p className={ui.cardHint} style={{ marginBottom: "1rem" }}>
        Run these in order for a strong client walkthrough. See{" "}
        <code className="mono" style={{ fontSize: "0.75rem" }}>
          docs/E2E_PARTNER_ONBOARDING.md
        </code>{" "}
        and{" "}
        <code className="mono" style={{ fontSize: "0.75rem" }}>
          tools/demo/README.md
        </code>
        .
      </p>
      <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {STEPS.map((step) => {
          const isDone = done.has(step.id);
          return (
            <li
              key={step.id}
              style={{
                display: "flex",
                gap: "0.75rem",
                alignItems: "flex-start",
                marginBottom: "0.875rem",
              }}
            >
              {isDone ? (
                <CheckCircle2
                  size={18}
                  aria-hidden
                  style={{ color: "var(--console-success)", flexShrink: 0, marginTop: 2 }}
                />
              ) : (
                <Circle
                  size={18}
                  aria-hidden
                  style={{ color: "var(--console-fg-subtle)", flexShrink: 0, marginTop: 2 }}
                />
              )}
              <div>
                <Link href={step.href} className={ui.tableLink}>
                  {step.label}
                </Link>
                <p
                  className={ui.cardHint}
                  style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem" }}
                >
                  {step.hint}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
