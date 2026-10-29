"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Check,
  MessageSquare,
  Plug,
  Radio,
  Workflow,
} from "lucide-react";

import { ConsolePage, PageHeader, ui } from "@/components/console/console-ui";

type WizardId = "slack" | "siem" | "n8n" | null;

const WIZARDS: Array<{
  id: Exclude<WizardId, null>;
  title: string;
  description: string;
  icon: typeof MessageSquare;
  steps: string[];
  ctaHref: string;
  ctaLabel: string;
}> = [
  {
    id: "slack",
    title: "Slack & Teams",
    description: "Approval buttons and Adaptive Cards for Ask a person.",
    icon: MessageSquare,
    steps: [
      "Open Governance settings and paste a Slack Incoming Webhook URL (or Teams connector URL).",
      "Trigger a payout that pauses for approval. The channel receives Approve / Decline.",
      "Optional: set dual-approver or escalation hours on the same page.",
    ],
    ctaHref: "/aegis/settings/governance",
    ctaLabel: "Open governance",
  },
  {
    id: "siem",
    title: "SIEM stream",
    description: "Datadog, Splunk, and Sentinel via OpenTelemetry.",
    icon: Radio,
    steps: [
      "Add a destination under Settings → Integrations (provider + OTel endpoint).",
      "Confirm status flips to active after the next witness flush.",
      "Verify events appear in your SIEM with APS-1 event ids.",
    ],
    ctaHref: "/aegis/settings/integrations",
    ctaLabel: "Configure SIEM",
  },
  {
    id: "n8n",
    title: "n8n / Make / Zapier",
    description: "Govern without rewriting the app: Workflow Bridge + community node.",
    icon: Workflow,
    steps: [
      "Create or pick an agent, then click Enable Workflow Bridge (Salanor signs server-side).",
      "Install n8n-nodes-salanor-aegis (or HTTP → POST /v1/aegis/policy/evaluate then /workflow-bridge/record).",
      "Run the sample workflow. Approvals / Live feed show a Verified receipt.",
    ],
    ctaHref: "/aegis/agents",
    ctaLabel: "Enable bridge on agent",
  },
];

export default function IntegrationsPage() {
  const [active, setActive] = useState<WizardId>(null);
  const wizard = WIZARDS.find((w) => w.id === active) ?? null;

  return (
    <ConsolePage>
      <PageHeader
        title="Integrations"
        subtitle="Guided setup for Slack, SIEM, and automation bridges. Gateway evaluate lives at /v1/aegis/gateway/* for HTTP agents."
      />

      <div className={ui.statGrid}>
        {WIZARDS.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.id}
              type="button"
              className={`${ui.card} ${ui.cardPad}`}
              style={{
                textAlign: "left",
                cursor: "pointer",
                borderColor:
                  active === card.id ? "var(--console-accent)" : undefined,
              }}
              onClick={() => setActive(card.id)}
            >
              <p
                className={ui.cardTitle}
                style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
              >
                <Icon size={16} aria-hidden />
                {card.title}
              </p>
              <p className={ui.cardHint} style={{ marginTop: "0.5rem" }}>
                {card.description}
              </p>
            </button>
          );
        })}
        <Link
          href="/aegis/coverage"
          className={`${ui.card} ${ui.cardPad}`}
          style={{ textDecoration: "none", color: "inherit", display: "block" }}
        >
          <p
            className={ui.cardTitle}
            style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
          >
            <Plug size={16} aria-hidden />
            Tool coverage
          </p>
          <p className={ui.cardHint} style={{ marginTop: "0.5rem" }}>
            See governed vs ungoverned tools, including the intentional demo gap.
          </p>
        </Link>
      </div>

      {wizard ? (
        <section className={`${ui.card} ${ui.cardPad}`} style={{ marginTop: "1.25rem" }}>
          <h2 className={ui.panelTitle} style={{ marginTop: 0 }}>
            {wizard.title} wizard
          </h2>
          <ol style={{ margin: "0 0 1rem", paddingLeft: "1.25rem" }}>
            {wizard.steps.map((step) => (
              <li
                key={step}
                style={{
                  marginBottom: "0.65rem",
                  fontSize: "0.875rem",
                  display: "flex",
                  gap: "0.5rem",
                }}
              >
                <Check
                  size={14}
                  aria-hidden
                  style={{ marginTop: "0.2rem", flexShrink: 0, opacity: 0.55 }}
                />
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <Link href={wizard.ctaHref} className={`${ui.btn} ${ui.btnPrimary}`}>
            {wizard.ctaLabel}
          </Link>
        </section>
      ) : null}
    </ConsolePage>
  );
}
