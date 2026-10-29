"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  ConsolePage,
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  ui,
} from "@/components/console/console-ui";
import { consoleApi } from "@/lib/api";
import type { AgentSummary } from "@/lib/types";

type WorkflowDetail = {
  workflow_id: string;
  name: string;
  description: string | null;
  environment: string;
  agent_id: string | null;
  policy_ids: string[];
  external_ref: string | null;
  fail_mode?: "fail_closed" | "fail_open_buffer";
  coverage_pct: number | null;
  evidence_readiness_pct: number | null;
};

type PolicySummary = {
  policy_id: string;
  name: string;
  status: string;
};

export default function WorkflowDetailPage() {
  const params = useParams();
  const workflowId = String(params.workflowId ?? "");
  const queryClient = useQueryClient();
  const [agentId, setAgentId] = useState("");
  const [selectedPolicies, setSelectedPolicies] = useState<string[]>([]);
  const [failMode, setFailMode] = useState<"fail_closed" | "fail_open_buffer">(
    "fail_closed",
  );

  const detailQuery = useQuery({
    queryKey: ["console", "workflows", workflowId],
    queryFn: () =>
      consoleApi<{ workflow: WorkflowDetail }>(
        `/workflows/${encodeURIComponent(workflowId)}`,
      ),
    enabled: Boolean(workflowId),
  });

  const agentsQuery = useQuery({
    queryKey: ["console", "agents", detailQuery.data?.workflow.environment],
    queryFn: () =>
      consoleApi<{ agents: AgentSummary[] }>(
        `/agents?environment=${detailQuery.data?.workflow.environment ?? "production"}`,
      ),
    enabled: Boolean(detailQuery.data?.workflow),
  });

  const policiesQuery = useQuery({
    queryKey: ["console", "policies", detailQuery.data?.workflow.environment],
    queryFn: () =>
      consoleApi<{ policies: PolicySummary[] }>(
        `/policies?environment=${detailQuery.data?.workflow.environment ?? "production"}`,
      ),
    enabled: Boolean(detailQuery.data?.workflow),
  });

  const workflow = detailQuery.data?.workflow;

  useEffect(() => {
    if (!workflow) return;
    setAgentId(workflow.agent_id ?? "");
    setSelectedPolicies(workflow.policy_ids);
    setFailMode(workflow.fail_mode ?? "fail_closed");
  }, [workflow]);

  const saveMutation = useMutation({
    mutationFn: () =>
      consoleApi<{ workflow: WorkflowDetail }>(
        `/workflows/${encodeURIComponent(workflowId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            agent_id: agentId || null,
            policy_ids: selectedPolicies,
            fail_mode: failMode,
          }),
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["console", "workflows", workflowId],
      });
      void queryClient.invalidateQueries({ queryKey: ["console", "workflows"] });
    },
  });

  function togglePolicy(id: string) {
    setSelectedPolicies((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  return (
    <ConsolePage>
      <PageHeader
        title={workflow?.name ?? "Workflow"}
        subtitle={
          workflow
            ? `${workflow.environment} · ${workflow.external_ref ?? workflow.workflow_id}`
            : "Loading…"
        }
        actions={
          <Link href="/aegis/workflows" className={`${ui.btn} ${ui.btnGhost}`}>
            All workflows
          </Link>
        }
      />

      {detailQuery.isPending ? <LoadingBlock /> : null}
      {detailQuery.error ? <ErrorAlert message="Workflow not found." /> : null}

      {workflow ? (
        <div className={ui.twoCol}>
          <section className={`${ui.card} ${ui.cardPad}`}>
            <h2 className={ui.panelTitle}>Scores</h2>
            <div className={ui.statGrid} style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div>
                <p className={ui.cardTitle}>Policy coverage</p>
                <p className={ui.cardValue}>{workflow.coverage_pct ?? 0}%</p>
              </div>
              <div>
                <p className={ui.cardTitle}>Evidence readiness</p>
                <p className={ui.cardValue}>
                  {workflow.evidence_readiness_pct ?? 0}%
                </p>
              </div>
            </div>
            {workflow.description ? (
              <p className={ui.cardHint} style={{ marginTop: "1rem" }}>
                {workflow.description}
              </p>
            ) : null}

            <h2 className={ui.panelTitle} style={{ marginTop: "1.5rem" }}>
              Flow
            </h2>
            <ol style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
              <li>Agent invokes tool (ingest)</li>
              <li>Policy evaluates → allow / ask a person / stop</li>
              <li>Human decides in Approvals (or Slack/Teams)</li>
              <li>Side effect runs · receipt sealed</li>
            </ol>
          </section>

          <section className={`${ui.card} ${ui.cardPad}`}>
            <h2 className={ui.panelTitle}>Link agent &amp; policies</h2>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginBottom: "1rem" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--console-fg-subtle)" }}>
                Agent
              </span>
              <select
                className={ui.select}
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
              >
                <option value="">None</option>
                {(agentsQuery.data?.agents ?? []).map((a) => (
                  <option key={a.agent_id} value={a.agent_id}>
                    {a.display_name || a.slug} ({a.agent_id.slice(0, 12)}…)
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginBottom: "1rem" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--console-fg-subtle)" }}>
                When Aegis is unreachable
              </span>
              <select
                className={ui.select}
                value={failMode}
                onChange={(e) =>
                  setFailMode(e.target.value as "fail_closed" | "fail_open_buffer")
                }
              >
                <option value="fail_closed">Fail closed (block the tool)</option>
                <option value="fail_open_buffer">
                  Fail open + buffer (allow and queue signed events locally)
                </option>
              </select>
            </label>

            <p style={{ fontSize: "0.75rem", color: "var(--console-fg-subtle)", marginBottom: "0.5rem" }}>
              Policy bundle
            </p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: "14rem", overflow: "auto" }}>
              {(policiesQuery.data?.policies ?? []).map((p) => (
                <li key={p.policy_id} style={{ marginBottom: "0.35rem" }}>
                  <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.875rem" }}>
                    <input
                      type="checkbox"
                      checked={selectedPolicies.includes(p.policy_id)}
                      onChange={() => togglePolicy(p.policy_id)}
                    />
                    <span>
                      {p.name}{" "}
                      <span style={{ opacity: 0.65 }}>({p.status})</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>

            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              style={{ marginTop: "1rem" }}
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              Save links
            </button>
            {saveMutation.isSuccess ? (
              <p className={ui.cardHint} style={{ marginTop: "0.5rem" }}>
                Saved.
              </p>
            ) : null}
            {saveMutation.error ? (
              <ErrorAlert message="Could not save workflow links." />
            ) : null}
          </section>
        </div>
      ) : null}
    </ConsolePage>
  );
}
