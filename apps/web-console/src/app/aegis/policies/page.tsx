"use client";

import { Plus, Shield } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { EmptyStatePanel } from "@/components/console/empty-state-panel";
import { Modal } from "@/components/console/modal";
import {
  ConsolePage,
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  StatusBadge,
  ui,
} from "@/components/console/console-ui";
import { consoleApi } from "@/lib/api";

type PolicySummary = {
  policy_id: string;
  name: string;
  version: number;
  status: string;
  activated_at: string | null;
};

export default function PoliciesPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("Custom policy");
  const [toolPattern, setToolPattern] = useState("stripe.*");
  const [decision, setDecision] = useState<"allow" | "deny">("deny");
  const [ruleType, setRuleType] = useState<
    "tool" | "max_per_tx" | "max_daily_total"
  >("tool");
  const [maxAmountUsd, setMaxAmountUsd] = useState("10000");

  const policiesQuery = useQuery({
    queryKey: ["console", "policies"],
    queryFn: () => consoleApi<{ policies: PolicySummary[] }>("/policies"),
  });

  const createPolicy = useMutation({
    mutationFn: () => {
      const conditions =
        ruleType === "tool"
          ? { rule_type: "tool" }
          : {
              rule_type: ruleType,
              max_amount_usd: Number.parseFloat(maxAmountUsd),
              window_hours: 24,
            };
      const ruleDecision =
        ruleType === "tool" ? decision : "deny";
      return consoleApi<{ policy: PolicySummary }>("/policies", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          rules: [
            {
              tool_pattern: toolPattern.trim(),
              decision: ruleDecision,
              priority: 100,
              conditions,
            },
          ],
        }),
      });
    },
    onSuccess: () => {
      setModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["console", "policies"] });
    },
  });

  const activate = useMutation({
    mutationFn: (policyId: string) =>
      consoleApi<{ policy: PolicySummary }>(
        `/policies/${encodeURIComponent(policyId)}/activate`,
        { method: "POST" },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["console", "policies"] });
    },
  });

  const policies = policiesQuery.data?.policies ?? [];
  const hasPolicies = policies.length > 0;

  return (
    <ConsolePage>
      <PageHeader
        title="Policies"
        subtitle="Tool access, per-transaction caps, and rolling daily totals. Enforced server-side on ingest and policy evaluate."
      />

      <div className={ui.toolbar} style={{ justifyContent: "flex-end", marginTop: 0 }}>
        <button
          type="button"
          className={`${ui.btn} ${ui.btnPrimary}`}
          onClick={() => setModalOpen(true)}
        >
          <Plus size={16} aria-hidden />
          Create policy
        </button>
      </div>

      {policiesQuery.isLoading ? <LoadingBlock /> : null}
      {policiesQuery.error ? <ErrorAlert message="Failed to load policies." /> : null}

      {!policiesQuery.isLoading && !hasPolicies ? (
        <EmptyStatePanel
          icon={Shield}
          title="No policies yet"
          description={
            <>
              Match <strong>tool names</strong> (patterns with <code className="mono">*</code>
              ). Rule types: deny/allow tool, max per transaction, or max daily total
              (catches repeated $2k wires). Events need <code className="mono">amount_usd</code>{" "}
              in payload — see <code className="mono">docs/APS_PAYLOAD.md</code>.
            </>
          }
          action={
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              onClick={() => setModalOpen(true)}
            >
              <Plus size={16} aria-hidden />
              Create policy
            </button>
          }
        />
      ) : null}

      {hasPolicies ? (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Version</th>
                <th>Status</th>
                <th>Activated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.policy_id}>
                  <td>
                    {p.name}{" "}
                    <span
                      className="mono"
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--console-fg-subtle)",
                      }}
                    >
                      {p.policy_id}
                    </span>
                  </td>
                  <td>{p.version}</td>
                  <td>
                    <StatusBadge status={p.status} />
                  </td>
                  <td>
                    {p.activated_at
                      ? new Date(p.activated_at).toLocaleString()
                      : "—"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {p.status !== "active" ? (
                      <button
                        type="button"
                        className={`${ui.btn} ${ui.btnSecondary}`}
                        onClick={() => activate.mutate(p.policy_id)}
                        disabled={activate.isPending}
                      >
                        Activate
                      </button>
                    ) : (
                      <span
                        style={{
                          color: "var(--console-fg-subtle)",
                          fontSize: "0.8125rem",
                        }}
                      >
                        Live
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Modal
        open={modalOpen}
        title="Create policy draft"
        description="Use * in tool patterns (e.g. stripe.*). Amount rules require amount_usd in the event payload."
        closeOnOverlayClick={false}
        onClose={() => {
          if (!createPolicy.isPending) setModalOpen(false);
        }}
        footer={
          <>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              onClick={() => setModalOpen(false)}
              disabled={createPolicy.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              disabled={createPolicy.isPending || !name.trim() || !toolPattern.trim()}
              onClick={() => createPolicy.mutate()}
            >
              {createPolicy.isPending ? "Creating…" : "Create draft"}
            </button>
          </>
        }
      >
        <label className={ui.field}>
          Name
          <input
            className={ui.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>
        <label className={ui.field} style={{ marginTop: "1rem" }}>
          Tool pattern
          <input
            className={ui.input}
            value={toolPattern}
            onChange={(e) => setToolPattern(e.target.value)}
            placeholder="stripe.paymentIntents.create"
          />
        </label>
        <label className={ui.field} style={{ marginTop: "1rem" }}>
          Rule type
          <select
            className={ui.select}
            value={ruleType}
            onChange={(e) =>
              setRuleType(e.target.value as typeof ruleType)
            }
          >
            <option value="tool">Tool allow / deny</option>
            <option value="max_per_tx">Max per transaction (USD)</option>
            <option value="max_daily_total">Max daily total (USD, 24h)</option>
          </select>
        </label>
        {ruleType === "tool" ? (
          <label className={ui.field} style={{ marginTop: "1rem" }}>
            Decision
            <select
              className={ui.select}
              value={decision}
              onChange={(e) => setDecision(e.target.value as "allow" | "deny")}
            >
              <option value="allow">allow</option>
              <option value="deny">deny</option>
            </select>
          </label>
        ) : (
          <label className={ui.field} style={{ marginTop: "1rem" }}>
            Max amount (USD)
            <input
              className={ui.input}
              type="number"
              min={0}
              step="0.01"
              value={maxAmountUsd}
              onChange={(e) => setMaxAmountUsd(e.target.value)}
            />
          </label>
        )}
        {createPolicy.isError ? (
          <ErrorAlert message={(createPolicy.error as Error).message} />
        ) : null}
      </Modal>
    </ConsolePage>
  );
}
