"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  ConsolePage,
  ErrorAlert,
  PageHeader,
  ui,
} from "@/components/console/console-ui";
import { consoleApi } from "@/lib/api";

type WorkflowChoice = "refunds" | "payouts" | "kyc";

const WORKFLOWS: Array<{
  id: WorkflowChoice;
  title: string;
  detail: string;
}> = [
  {
    id: "refunds",
    title: "Refunds",
    detail: "Retail consumer refunds above USD 200 ask a person before money moves.",
  },
  {
    id: "payouts",
    title: "Payouts",
    detail: "Merchant payouts above USD 1,000 to merchants younger than 30 days ask a person.",
  },
  {
    id: "kyc",
    title: "KYC review",
    detail: "Uses your KYC agent policies when present; otherwise apply Payments first.",
  },
];

export default function GetStartedPage() {
  const queryClient = useQueryClient();
  const [workflow, setWorkflow] = useState<WorkflowChoice>("refunds");
  const [message, setMessage] = useState<string | null>(null);

  const policiesQuery = useQuery({
    queryKey: ["console", "policies"],
    queryFn: () =>
      consoleApi<{ policies: Array<{ policy_id: string; name: string; status: string }> }>(
        "/policies",
      ),
  });

  const applyPayments = useMutation({
    mutationFn: async () => {
      const refund = await consoleApi<{
        policy: { policy_id: string };
      }>("/policies", {
        method: "POST",
        body: JSON.stringify({
          name: "Payments template: retail refunds",
          rules: [
            {
              tool_pattern: "stripe.paymentIntents.create",
              decision: "allow_with_obligation",
              priority: 200,
              conditions: {
                rule_type: "max_per_tx",
                max_amount_usd: 200,
                when: { segment: "retail", account_type: "consumer" },
              },
            },
          ],
        }),
      });
      await consoleApi(`/policies/${encodeURIComponent(refund.policy.policy_id)}/activate`, {
        method: "POST",
      });

      const payout = await consoleApi<{
        policy: { policy_id: string };
      }>("/policies", {
        method: "POST",
        body: JSON.stringify({
          name: "Payments template: new merchant payouts",
          rules: [
            {
              tool_pattern: "payments.payout.create",
              decision: "allow_with_obligation",
              priority: 300,
              conditions: {
                rule_type: "max_per_tx",
                max_amount_usd: 1000,
                when: { merchant_age_days_lt: 30 },
              },
            },
          ],
        }),
      });
      await consoleApi(`/policies/${encodeURIComponent(payout.policy.policy_id)}/activate`, {
        method: "POST",
      });
      return { refundId: refund.policy.policy_id, payoutId: payout.policy.policy_id };
    },
    onSuccess: () => {
      setMessage("Payments rules applied. Refunds and payouts above the limits will ask a person.");
      void queryClient.invalidateQueries({ queryKey: ["console", "policies"] });
    },
  });

  const activeCount =
    policiesQuery.data?.policies.filter((p) => p.status === "active").length ?? 0;

  return (
    <ConsolePage>
      <PageHeader
        title="Get started"
        subtitle="First sealed case in under 15 minutes. Sample payments only: your bank systems stay untouched."
      />

      <p
        className={`${ui.alert} ${ui.alertInfo}`}
        style={{ marginBottom: "1.25rem", fontSize: "0.875rem" }}
      >
        Aegis does not decide what is fraud. Your models and rules do. Aegis applies them to
        automated actions (Allow, Stop, or Ask a person) and seals the evidence.
      </p>

      {applyPayments.error ? (
        <ErrorAlert message={(applyPayments.error as Error).message} />
      ) : null}
      {message ? (
        <p className={`${ui.alert} ${ui.alertSuccess}`} style={{ marginBottom: "1rem" }}>
          {message}
        </p>
      ) : null}

      <section className={`${ui.card} ${ui.cardPad}`} style={{ marginBottom: "1.25rem" }}>
        <h2 className={ui.panelTitle}>1. Turn on Payments rules</h2>
        <p style={{ fontSize: "0.875rem", color: "var(--console-fg-muted)", marginTop: 0 }}>
          Pick the workflow you care about. One click loads rules that pause risky AI money
          movement until a person decides.
        </p>
        <div
          style={{
            display: "grid",
            gap: "0.75rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
          }}
        >
          {WORKFLOWS.map((w) => (
            <label
              key={w.id}
              className={`${ui.card} ${ui.cardPad}`}
              style={{
                cursor: "pointer",
                borderColor:
                  workflow === w.id
                    ? "var(--console-accent)"
                    : "var(--console-border)",
              }}
            >
              <input
                type="radio"
                name="workflow"
                checked={workflow === w.id}
                onChange={() => setWorkflow(w.id)}
                style={{ marginRight: "0.5rem" }}
              />
              <strong>{w.title}</strong>
              <p
                style={{
                  margin: "0.5rem 0 0",
                  fontSize: "0.8125rem",
                  color: "var(--console-fg-muted)",
                }}
              >
                {w.detail}
              </p>
            </label>
          ))}
        </div>
        <div style={{ marginTop: "1rem", display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnPrimary}`}
            disabled={applyPayments.isPending}
            onClick={() => applyPayments.mutate()}
          >
            {applyPayments.isPending ? "Applying…" : "Apply Payments template"}
          </button>
          <span style={{ fontSize: "0.8125rem", color: "var(--console-fg-muted)", alignSelf: "center" }}>
            {activeCount > 0
              ? `${activeCount} active rule set(s) on this organization.`
              : "No active rules yet."}
          </span>
        </div>
      </section>

      <section className={`${ui.card} ${ui.cardPad}`} style={{ marginBottom: "1.25rem" }}>
        <h2 className={ui.panelTitle}>2. Walk a sample case</h2>
        <p style={{ fontSize: "0.875rem", color: "var(--console-fg-muted)", marginTop: 0 }}>
          After sample actions are in this org, follow this path: no engineering required in
          the room.
        </p>
        <ol style={{ margin: "0 0 1rem", paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
          <li style={{ marginBottom: "0.5rem" }}>
            <Link href="/aegis/traces" className={ui.tableLink}>
              Cases
            </Link>
            : open a row. Outcomes read <strong>Allowed</strong>, <strong>Stopped</strong>, or{" "}
            <strong>Ask a person</strong>.
          </li>
          <li style={{ marginBottom: "0.5rem" }}>
            <Link href="/aegis/approvals" className={ui.tableLink}>
              Approvals
            </Link>
            : Approve or Decline the held payment.
          </li>
          <li style={{ marginBottom: "0.5rem" }}>
            On the case, read the header sentence and the four answers, then{" "}
            <strong>Watch what happened</strong> (story of the sealed record; nothing re-runs).
          </li>
          <li>
            <Link href="/verify" className={ui.tableLink}>
              Verify
            </Link>
            : confirm the seal, then <strong>Run tamper demo</strong> (a one-byte change must fail).
          </li>
        </ol>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <Link href="/aegis/traces" className={`${ui.btn} ${ui.btnPrimary}`}>
            Open Cases
          </Link>
          <Link href="/aegis/approvals" className={`${ui.btn} ${ui.btnSecondary}`}>
            Open Approvals
          </Link>
        </div>
      </section>

      <section className={`${ui.card} ${ui.cardPad}`} style={{ marginBottom: "1.25rem" }}>
        <h2 className={ui.panelTitle}>3. After the aha</h2>
        <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
          <li style={{ marginBottom: "0.35rem" }}>
            <Link href="/aegis/settings/governance" className={ui.tableLink}>
              Governance
            </Link>
            : Slack notify when something waits for a person
          </li>
          <li style={{ marginBottom: "0.35rem" }}>
            <Link href="/aegis/members" className={ui.tableLink}>
              Members
            </Link>
            : invite an approver
          </li>
          <li>
            <Link href="/aegis/keys" className={ui.tableLink}>
              API keys
            </Link>
            : connect your own agents when you are ready
          </li>
        </ul>
      </section>

      <details className={`${ui.card} ${ui.cardPad}`}>
        <summary
          className={ui.panelTitle}
          style={{ cursor: "pointer", marginBottom: 0, fontSize: "0.9375rem" }}
        >
          Advanced: sample data for demo operators
        </summary>
        <p style={{ fontSize: "0.8125rem", color: "var(--console-fg-muted)", marginTop: "0.75rem" }}>
          Clients never need this. Salanor (or your integration engineer) seeds Northwind sample
          actions from the repo while API + Console are running.
        </p>
        <ol style={{ margin: "0 0 0.75rem", paddingLeft: "1.25rem", fontSize: "0.8125rem" }}>
          <li style={{ marginBottom: "0.35rem" }}>
            Stopped path:{" "}
            <code className="mono">pnpm pilot:ensure-policy && pnpm pilot:agent</code>
          </li>
          <li style={{ marginBottom: "0.35rem" }}>
            Ask a person (Standard $249):{" "}
            <code className="mono">
              pnpm pilot:ensure-approval-policy && pnpm pilot:agent:approval
            </code>
          </li>
          <li style={{ marginBottom: "0.35rem" }}>
            Same amount Allowed for Gold:{" "}
            <code className="mono">pnpm pilot:agent:approval:gold</code>
          </li>
          <li style={{ marginBottom: "0.35rem" }}>
            After Approve in Console, resume with the id from the terminal:{" "}
            <code className="mono">pnpm pilot:agent:resume apr_…</code>
          </li>
          <li style={{ marginBottom: "0.35rem" }}>
            Payout hold: <code className="mono">pnpm pilot:agent:payout</code> then{" "}
            <code className="mono">pnpm pilot:agent:resume:payout apr_…</code>
          </li>
          <li>
            Offline verify:{" "}
            <code className="mono">
              pnpm verifier:public -- --org northwind-payments --event &lt;event_id&gt;
            </code>
          </li>
        </ol>
      </details>
    </ConsolePage>
  );
}
