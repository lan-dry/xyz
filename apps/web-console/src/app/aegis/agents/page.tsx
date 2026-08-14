"use client";

import { Bot, Copy, KeyRound, Plus } from "lucide-react";
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

  const [byokModalOpen, setByokModalOpen] = useState(false);
  const [byokAgentId, setByokAgentId] = useState<string | null>(null);
  const [byokPublicKey, setByokPublicKey] = useState("");
  const [byokKmsProvider, setByokKmsProvider] = useState<
    "customer" | "aws" | "gcp" | "vault"
  >("customer");
  const [byokKmsKeyArn, setByokKmsKeyArn] = useState("");
  const [byokMessage, setByokMessage] = useState<string | null>(null);

  const [bridgeMessage, setBridgeMessage] = useState<string | null>(null);
  /** Optimistic: show "on" immediately after Enable succeeds (even if list API is stale). */
  const [bridgeForcedOn, setBridgeForcedOn] = useState<Record<string, true>>({});

  const registerByok = useMutation({
    mutationFn: (input: {
      agentId: string;
      public_key_b64: string;
      kms_provider: "customer" | "aws" | "gcp" | "vault";
      kms_key_arn?: string;
    }) =>
      consoleApi<{ key_id: string; message: string }>(
        `/agents/${encodeURIComponent(input.agentId)}/keys/byok`,
        {
          method: "POST",
          body: JSON.stringify({
            public_key_b64: input.public_key_b64.trim(),
            kms_provider: input.kms_provider,
            kms_key_arn: input.kms_key_arn?.trim() || undefined,
          }),
        },
      ),
    onSuccess: (data) => {
      setByokMessage(data.message);
      setByokModalOpen(false);
      setByokAgentId(null);
      setByokPublicKey("");
      setByokKmsProvider("customer");
      setByokKmsKeyArn("");
      void queryClient.invalidateQueries({ queryKey: ["console", "agents"] });
    },
  });

  const enableBridge = useMutation({
    mutationFn: (agentId: string) =>
      consoleApi<{
        agent_id: string;
        key_id: string;
        message: string;
      }>(`/agents/${encodeURIComponent(agentId)}/workflow-bridge`, {
        method: "POST",
        body: "{}",
      }),
    onSuccess: (data) => {
      setBridgeMessage(data.message);
      setBridgeForcedOn((prev) => ({ ...prev, [data.agent_id]: true }));
      void queryClient.invalidateQueries({ queryKey: ["console", "agents"] });
      void queryClient.refetchQueries({ queryKey: ["console", "agents"] });
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
        subtitle="Software identities that sign APS-1 events. SDK path: platform-generated or BYOK (your public key only). Orchestrator path (n8n, Zapier, Make, HTTP): enable Workflow Bridge once and Salanor signs server-side."
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
          <strong>Agent created: copy SDK credentials now</strong>
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

      {byokMessage ? (
        <div className={`${ui.alert} ${ui.alertSuccess}`} style={{ marginBottom: "1.5rem" }}>
          {byokMessage}
        </div>
      ) : null}
      {registerByok.isError ? (
        <ErrorAlert message={(registerByok.error as Error).message} />
      ) : null}

      {bridgeMessage ? (
        <div className={`${ui.alert} ${ui.alertSuccess}`} style={{ marginBottom: "1.5rem" }}>
          {bridgeMessage}
        </div>
      ) : null}
      {enableBridge.isError ? (
        <ErrorAlert message={(enableBridge.error as Error).message} />
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
                <th>Orchestrators</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => {
                const bridgeOn =
                  bridgeForcedOn[agent.agent_id] === true ||
                  agent.workflow_bridge_enabled === true ||
                  agent.signing_keys.some((k) => k.bridge_enabled && !k.revoked);
                return (
                <tr key={agent.agent_id}>
                  <td>
                    <strong>{agent.display_name ?? agent.slug}</strong>
                    <div className={ui.tableMuted}>slug: {agent.slug}</div>
                  </td>
                  <td className="mono">{agent.agent_id}</td>
                  <td>
                    {agent.signing_keys.length === 0 ? (
                      <span className={ui.tableMuted}>-</span>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                        {agent.signing_keys.map((k) => (
                          <li key={k.key_id} className="mono" style={{ fontSize: "0.75rem" }}>
                            {k.key_id}
                            {k.kms_provider && k.kms_provider !== "platform"
                              ? ` · BYOK (${k.kms_provider})`
                              : ""}
                            {k.bridge_enabled && !k.revoked ? " · bridge" : ""}
                            {k.revoked ? " (revoked)" : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td>{formatRelativeTime(agent.created_at)}</td>
                  <td>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    <button
                      type="button"
                      className={`${ui.btn} ${ui.btnSecondary}`}
                      disabled={registerByok.isPending}
                      onClick={() => {
                        setByokAgentId(agent.agent_id);
                        setByokModalOpen(true);
                      }}
                      title="Register your Ed25519 public key. Private key stays in your KMS or HSM."
                    >
                      <KeyRound size={14} aria-hidden /> Register BYOK key
                    </button>
                    {bridgeOn ? (
                      <span
                        className={`${ui.badge} ${ui.badgeSuccess}`}
                        title="One n8n HTTP node: POST /v1/aegis/workflows/runs/capture with your ingest API key"
                      >
                        Workflow Bridge on
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={`${ui.btn} ${ui.btnSecondary}`}
                        disabled={enableBridge.isPending}
                        onClick={() => enableBridge.mutate(agent.agent_id)}
                        title="Server-signed traces for orchestrators (n8n, Zapier, Make, HTTP). No private key in the tool."
                      >
                        Enable Workflow Bridge
                      </button>
                    )}
                    </div>
                  </td>
                </tr>
                );
              })}
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

      <Modal
        open={byokModalOpen}
        title="Register BYOK signing key"
        onClose={() => setByokModalOpen(false)}
        closeOnOverlayClick={false}
      >
        <form
          className={ui.formGrid}
          onSubmit={(e) => {
            e.preventDefault();
            if (!byokAgentId) return;
            registerByok.mutate({
              agentId: byokAgentId,
              public_key_b64: byokPublicKey,
              kms_provider: byokKmsProvider,
              kms_key_arn:
                byokKmsProvider === "aws" || byokKmsProvider === "gcp"
                  ? byokKmsKeyArn
                  : undefined,
            });
          }}
        >
          <div
            style={{
              fontSize: "0.8125rem",
              color: "var(--muted)",
              margin: 0,
              display: "grid",
              gap: "0.5rem",
            }}
          >
            <p style={{ margin: 0 }}>
              <strong>What this does:</strong> Salanor will trust events signed with your
              private key by storing your public key here. We verify signatures on ingest; we
              never receive or store your private key.
            </p>
            <ul style={{ margin: 0, paddingLeft: "1.15rem" }}>
              <li>
                <strong>Customer-held:</strong> your SDK or agent signs locally with the
                private key.
              </li>
              <li>
                <strong>AWS / GCP KMS:</strong> for Workflow Bridge and human-approval signing,
                Salanor calls your KMS to sign (no raw private key on our servers).
              </li>
            </ul>
          </div>
          <label className={ui.field}>
            Public key (base64)
            <textarea
              className={ui.input}
              rows={3}
              value={byokPublicKey}
              onChange={(e) => setByokPublicKey(e.target.value)}
              placeholder="Base64-encoded 32-byte Ed25519 public key"
              required
            />
          </label>
          <label className={ui.field}>
            KMS provider
            <select
              className={ui.input}
              value={byokKmsProvider}
              onChange={(e) =>
                setByokKmsProvider(
                  e.target.value as "customer" | "aws" | "gcp" | "vault",
                )
              }
            >
              <option value="customer">Customer-held (you sign locally)</option>
              <option value="aws">AWS KMS (server calls kms:Sign)</option>
              <option value="gcp">GCP Cloud KMS (server asymmetricSign)</option>
              <option value="vault">Vault bridge (encrypted key in Salanor)</option>
            </select>
          </label>
          {byokKmsProvider === "aws" || byokKmsProvider === "gcp" ? (
            <label className={ui.field}>
              KMS key ARN / resource name
              <input
                className={ui.input}
                value={byokKmsKeyArn}
                onChange={(e) => setByokKmsKeyArn(e.target.value)}
                placeholder={
                  byokKmsProvider === "aws"
                    ? "arn:aws:kms:region:account:key/…"
                    : "projects/…/locations/…/keyRings/…/cryptoKeys/…/cryptoKeyVersions/…"
                }
                required
              />
            </label>
          ) : null}
          {registerByok.isError ? (
            <ErrorAlert message={(registerByok.error as Error).message} />
          ) : null}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="submit"
              className={`${ui.btn} ${ui.btnPrimary}`}
              disabled={registerByok.isPending}
            >
              {registerByok.isPending ? "Registering…" : "Register key"}
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              onClick={() => setByokModalOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </ConsolePage>
  );
}
