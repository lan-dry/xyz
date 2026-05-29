"use client";

import { Bot, Copy, Plus } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { EmptyStatePanel } from "@/components/console/empty-state-panel";
import { Modal } from "@/components/console/modal";
import {
  ConsolePage,
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  ui,
} from "@/components/console/console-ui";
import { consoleApi } from "@/lib/api";
import { formatRelativeTime } from "@/lib/relative-time";
import type { AgentSummary, AgentCredentialsPayload } from "@/lib/types";

export default function AgentsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [createdCreds, setCreatedCreds] = useState<AgentCredentialsPayload | null>(
    null,
  );

  const agentsQuery = useQuery({
    queryKey: ["console", "agents"],
    queryFn: () => consoleApi<{ agents: AgentSummary[] }>("/agents"),
  });

  const createAgent = useMutation({
    mutationFn: () =>
      consoleApi<{
        credentials: AgentCredentialsPayload;
        message: string;
      }>("/agents", {
        method: "POST",
        body: JSON.stringify({
          display_name: displayName.trim() || undefined,
          slug: slug.trim() || undefined,
        }),
      }),
    onSuccess: (data) => {
      setCreatedCreds(data.credentials);
      setDisplayName("");
      setSlug("");
      setModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["console", "agents"] });
    },
  });

  const agents = agentsQuery.data?.agents ?? [];

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
  }

  return (
    <ConsolePage>
      <PageHeader
        title="Agents"
        subtitle="Software identities that sign and emit APS-1 events for your organization. Each agent has a signing key; the private key is shown once at creation."
        actions={
          <button
            type="button"
            className={`${ui.btn} ${ui.btnPrimary}`}
            onClick={() => {
              setCreatedCreds(null);
              setModalOpen(true);
            }}
          >
            <Plus size={16} aria-hidden />
            Create agent
          </button>
        }
      />

      {createdCreds ? (
        <div className={`${ui.alert} ${ui.alertSuccess}`} style={{ marginBottom: "1.5rem" }}>
          <strong>Agent created — copy SDK credentials now</strong>
          <p style={{ margin: "0.5rem 0", fontSize: "0.8125rem" }}>
            This private key cannot be retrieved again. Store it in a secrets manager.
          </p>
          <pre className={ui.pre}>{JSON.stringify(createdCreds, null, 2)}</pre>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            style={{ marginTop: "0.75rem" }}
            onClick={() => void copyText(JSON.stringify(createdCreds, null, 2))}
          >
            <Copy size={14} aria-hidden /> Copy JSON
          </button>
        </div>
      ) : null}

      {agentsQuery.isPending ? <LoadingBlock /> : null}
      {agentsQuery.isError ? (
        <ErrorAlert message={(agentsQuery.error as Error).message} />
      ) : null}

      {!agentsQuery.isPending && agents.length === 0 ? (
        <EmptyStatePanel
          icon={Bot}
          title="No agents yet"
          description="Create an agent to get agent_id, key_id, and a signing key pair for the Aegis SDK."
        />
      ) : null}

      {agents.length > 0 ? (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Agent ID</th>
                <th>Signing keys</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.agent_id}>
                  <td>
                    <strong>{agent.display_name ?? agent.slug}</strong>
                    <div className={ui.tableMuted}>slug: {agent.slug}</div>
                  </td>
                  <td className="mono">{agent.agent_id}</td>
                  <td>
                    {agent.signing_keys.length === 0 ? (
                      <span className={ui.tableMuted}>—</span>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                        {agent.signing_keys.map((k) => (
                          <li key={k.key_id} className="mono" style={{ fontSize: "0.75rem" }}>
                            {k.key_id}
                            {k.revoked ? " (revoked)" : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td>{formatRelativeTime(agent.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Modal
        open={modalOpen}
        title="Create agent"
        onClose={() => setModalOpen(false)}
      >
        <form
          className={ui.formGrid}
          onSubmit={(e) => {
            e.preventDefault();
            createAgent.mutate();
          }}
        >
          <label className={ui.field}>
            Display name
            <input
              className={ui.input}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Production agent"
            />
          </label>
          <label className={ui.field}>
            Slug (optional)
            <input
              className={ui.input}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="default"
            />
          </label>
          <p style={{ fontSize: "0.8125rem", color: "var(--muted)", margin: 0 }}>
            A new Ed25519 key pair will be generated. The private key is shown once after
            creation.
          </p>
          {createAgent.isError ? (
            <ErrorAlert message={(createAgent.error as Error).message} />
          ) : null}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="submit"
              className={`${ui.btn} ${ui.btnPrimary}`}
              disabled={createAgent.isPending}
            >
              {createAgent.isPending ? "Creating…" : "Create agent"}
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </ConsolePage>
  );
}
