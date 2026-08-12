"use client";

import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";

import { ui } from "./console-ui";

const STEPS = [
  {
    id: "policy",
    label: "Create & activate a policy",
    hint: "Require approval on jmts.content.publish (or your riskiest tool)",
    href: "/aegis/policies",
  },
  {
    id: "n8n",
    label: "Run governed n8n workflow",
    hint: "Import examples/n8n/jmt-s-content-sync-with-aegis.json. Publish requires approval.",
    href: "/aegis/policies",
  },
  {
    id: "approval",
    label: "Human approval (obligation queue)",
    hint: "Start the demo here: blocked publish with context, then approve",
    href: "/aegis/approvals",
  },
  {
    id: "trace",
    label: "Open trace & verify event",
    hint: "Event detail: Verify chain + inclusion",
    href: "/aegis/traces",
  },
  {
    id: "ingest",
    label: "Ingest a signed event",
    hint: "Issue an ingest API key and send signed APS-1 events from your runtime",
    href: "/aegis/keys",
  },
  {
    id: "members",
    label: "Invite teammate & change role",
    hint: "Members: invite, role dropdown",
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
        for implementation and rollout guidance.
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
