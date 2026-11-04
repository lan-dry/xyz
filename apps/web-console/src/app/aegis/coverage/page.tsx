"use client";

import Link from "next/link";
import { PieChart, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { AegisMark } from "@/components/console/aegis-mark";
import { EmptyStatePanel } from "@/components/console/empty-state-panel";
import {
  ConsolePage,
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  StatusBadge,
  ui,
} from "@/components/console/console-ui";
import { consoleApi } from "@/lib/api";
import {
  environmentLabel,
  readConsoleEnvironment,
  type ConsoleEnvironment,
} from "@/lib/console-environment";

type CoverageTool = {
  tool_name: string;
  governed: boolean;
  source: "event" | "declared" | "both";
  event_count: number;
  matched_patterns: string[];
  agent_ids: string[];
};

type CoverageReport = {
  environment: string;
  governed_count: number;
  ungoverned_count: number;
  tools: CoverageTool[];
};

export default function CoveragePage() {
  const [environment, setEnvironment] = useState<ConsoleEnvironment>("production");

  useEffect(() => {
    setEnvironment(readConsoleEnvironment());
    function onEnv(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail === "sandbox" || detail === "production") setEnvironment(detail);
    }
    window.addEventListener("salanor:console-environment", onEnv);
    return () => window.removeEventListener("salanor:console-environment", onEnv);
  }, []);

  const coverageQuery = useQuery({
    queryKey: ["console", "coverage", environment],
    queryFn: () =>
      consoleApi<{ coverage: CoverageReport; error?: string }>(
        `/coverage?environment=${environment}`,
      ),
  });

  const coverage = coverageQuery.data?.coverage;
  const tools = coverage?.tools ?? [];
  const ungoverned = tools.filter((t) => !t.governed);
  const governed = tools.filter((t) => t.governed);

  return (
    <ConsolePage>
      <PageHeader
        title="Coverage"
        subtitle={`Which tools are covered by an active policy in ${environmentLabel(environment)}. Ungoverned tools are gaps.`}
        actions={
          <Link href="/aegis/policies" className={`${ui.btn} ${ui.btnPrimary}`}>
            <Shield size={14} aria-hidden /> Create a policy
          </Link>
        }
      />

      {coverageQuery.isPending ? <LoadingBlock /> : null}
      {coverageQuery.error ? (
        <ErrorAlert message="Failed to load coverage. If this persists, run database migrations on the API." />
      ) : null}

      {coverage && !coverageQuery.isPending ? (
        <div
          className={ui.statGrid}
          style={{ marginBottom: "1.25rem" }}
        >
          <div className={`${ui.card} ${ui.cardPad}`}>
            <p className={ui.cardTitle} style={{ margin: 0 }}>
              Governed tools
            </p>
            <p className={ui.cardValue} style={{ margin: "0.35rem 0 0" }}>
              {coverage.governed_count}
            </p>
          </div>
          <div className={`${ui.card} ${ui.cardPad}`}>
            <p className={ui.cardTitle} style={{ margin: 0 }}>
              Ungoverned tools
            </p>
            <p className={ui.cardValue} style={{ margin: "0.35rem 0 0" }}>
              {coverage.ungoverned_count}
            </p>
            <p className={ui.cardHint} style={{ margin: "0.35rem 0 0" }}>
              {coverage.ungoverned_count > 0
                ? "Add a policy so these cannot run unchecked."
                : "All seen tools match an active rule."}
            </p>
          </div>
        </div>
      ) : null}

      {!coverageQuery.isPending &&
      !coverageQuery.error &&
      tools.length === 0 ? (
        <EmptyStatePanel
          mark={<AegisMark />}
          title="No tools recorded yet"
          description="Connect an agent and run a governed action, or declare tools on an agent. Coverage compares those tools to your active policies."
          action={
            <Link href="/aegis/agents" className={`${ui.btn} ${ui.btnPrimary}`}>
              Connect an agent
            </Link>
          }
          secondary={
            <Link href="/aegis/policies" className={`${ui.btn} ${ui.btnGhost}`}>
              Create a policy
            </Link>
          }
        />
      ) : null}

      {ungoverned.length > 0 ? (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2 className={ui.panelTitle}>Needs a policy</h2>
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Status</th>
                  <th>Seen</th>
                  <th>Agents</th>
                </tr>
              </thead>
              <tbody>
                {ungoverned.map((t) => (
                  <tr key={t.tool_name}>
                    <td className="mono">{t.tool_name}</td>
                    <td>
                      <StatusBadge status="failed" />
                      <span
                        style={{
                          marginLeft: "0.5rem",
                          fontSize: "0.8125rem",
                          color: "var(--console-fg-muted)",
                        }}
                      >
                        Ungoverned
                      </span>
                    </td>
                    <td>{t.event_count}</td>
                    <td className="mono" style={{ fontSize: "0.75rem" }}>
                      {t.agent_ids.slice(0, 3).join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {governed.length > 0 ? (
        <section>
          <h2 className={ui.panelTitle}>Covered by policy</h2>
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Status</th>
                  <th>Matching rule</th>
                  <th>Seen</th>
                </tr>
              </thead>
              <tbody>
                {governed.map((t) => (
                  <tr key={t.tool_name}>
                    <td className="mono">{t.tool_name}</td>
                    <td>
                      <StatusBadge status="ok" />
                      <span
                        style={{
                          marginLeft: "0.5rem",
                          fontSize: "0.8125rem",
                          color: "var(--console-fg-muted)",
                        }}
                      >
                        Governed
                      </span>
                    </td>
                    <td className="mono" style={{ fontSize: "0.75rem" }}>
                      {t.matched_patterns.join(", ") || "—"}
                    </td>
                    <td>{t.event_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tools.length > 0 ? (
        <p
          style={{
            marginTop: "1.25rem",
            fontSize: "0.8125rem",
            color: "var(--console-fg-muted)",
          }}
        >
          <PieChart
            size={14}
            aria-hidden
            style={{ verticalAlign: "-2px", marginRight: "0.35rem" }}
          />
          Coverage uses tools seen in the last 90 days plus tools declared on
          agents, matched against active policy patterns.
        </p>
      ) : null}
    </ConsolePage>
  );
}
