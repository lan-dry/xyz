"use client";

import { Eye, Pencil, Plus, Shield, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

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

type PolicyConflict = {
  tool_pattern: string;
  drafts: Array<{ policy_id: string; name: string; decision: string }>;
};

type PolicyRule = {
  rule_id: string;
  tool_pattern: string;
  decision: string;
  priority: number;
  conditions: Record<string, unknown> | null;
};

type PolicyFormState = {
  name: string;
  toolPattern: string;
  decision: "allow" | "deny" | "allow_with_obligation";
  ruleType: "tool" | "max_per_tx" | "min_per_tx" | "max_daily_total";
  maxAmountUsd: string;
};

const DEFAULT_FORM: PolicyFormState = {
  name: "Custom policy",
  toolPattern: "stripe.*",
  decision: "deny",
  ruleType: "tool",
  maxAmountUsd: "10000",
};

function buildRulesPayload(form: PolicyFormState) {
  const conditions =
    form.ruleType === "tool"
      ? { rule_type: "tool" }
      : form.ruleType === "min_per_tx"
        ? {
            rule_type: "min_per_tx",
            min_amount_usd: Number.parseFloat(form.maxAmountUsd),
            window_hours: 24,
          }
        : {
            rule_type: form.ruleType,
            max_amount_usd: Number.parseFloat(form.maxAmountUsd),
            window_hours: 24,
          };
  const ruleDecision = form.decision;
  return [
    {
      tool_pattern: form.toolPattern.trim(),
      decision: ruleDecision,
      priority: 100,
      conditions,
    },
  ];
}

function ruleSummary(rule: PolicyRule): string {
  const cond = rule.conditions as {
    rule_type?: string;
    max_amount_usd?: number;
    min_amount_usd?: number;
  } | null;
  const decisionLabel =
    rule.decision === "allow_with_obligation" ? "require approval" : rule.decision;
  if (cond?.rule_type === "max_per_tx") {
    return `Max $${cond.max_amount_usd ?? "?"} per transaction → ${decisionLabel}`;
  }
  if (cond?.rule_type === "min_per_tx") {
    return `Min $${cond.min_amount_usd ?? "?"} per transaction → ${decisionLabel}`;
  }
  if (cond?.rule_type === "max_daily_total") {
    return `Max $${cond.max_amount_usd ?? "?"} daily → ${decisionLabel}`;
  }
  return `${rule.tool_pattern} → ${decisionLabel}`;
}

export default function PoliciesPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editPolicyId, setEditPolicyId] = useState<string | null>(null);
  const [viewPolicyId, setViewPolicyId] = useState<string | null>(null);
  const [deletePolicyId, setDeletePolicyId] = useState<string | null>(null);
  const [retirePolicyId, setRetirePolicyId] = useState<string | null>(null);
  const [form, setForm] = useState<PolicyFormState>(DEFAULT_FORM);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const policiesQuery = useQuery({
    queryKey: ["console", "policies"],
    queryFn: () =>
      consoleApi<{ policies: PolicySummary[]; draft_conflicts?: PolicyConflict[] }>(
        "/policies",
      ),
  });

  const detailQuery = useQuery({
    queryKey: ["console", "policies", viewPolicyId ?? editPolicyId],
    queryFn: () =>
      consoleApi<{ policy: PolicySummary; rules: PolicyRule[] }>(
        `/policies/${encodeURIComponent(viewPolicyId ?? editPolicyId!)}`,
      ),
    enabled: Boolean(viewPolicyId ?? editPolicyId),
  });

  const resetForm = useCallback(() => setForm(DEFAULT_FORM), []);

  const openEdit = useCallback((policyId: string) => {
    setEditPolicyId(policyId);
    setViewPolicyId(null);
  }, []);

  const createPolicy = useMutation({
    mutationFn: () =>
      consoleApi<{ policy: PolicySummary }>("/policies", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          rules: buildRulesPayload(form),
        }),
      }),
    onSuccess: () => {
      setCreateOpen(false);
      resetForm();
      void queryClient.invalidateQueries({ queryKey: ["console", "policies"] });
    },
  });

  const updatePolicy = useMutation({
    mutationFn: (policyId: string) =>
      consoleApi<{ policy: PolicySummary }>(
        `/policies/${encodeURIComponent(policyId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: form.name.trim(),
            rules: buildRulesPayload(form),
          }),
        },
      ),
    onSuccess: () => {
      setEditPolicyId(null);
      resetForm();
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

  const archivePolicy = useMutation({
    mutationFn: (policyId: string) =>
      consoleApi<{ policy: PolicySummary }>(
        `/policies/${encodeURIComponent(policyId)}/archive`,
        { method: "POST" },
      ),
    onSuccess: () => {
      setRetirePolicyId(null);
      void queryClient.invalidateQueries({ queryKey: ["console", "policies"] });
    },
  });

  const deletePolicy = useMutation({
    mutationFn: (policyId: string) =>
      consoleApi<{ ok: boolean }>(
        `/policies/${encodeURIComponent(policyId)}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      setDeletePolicyId(null);
      void queryClient.invalidateQueries({ queryKey: ["console", "policies"] });
    },
  });

  const policies = policiesQuery.data?.policies ?? [];
  const draftConflicts = policiesQuery.data?.draft_conflicts ?? [];
  const activeCount = policies.filter((p) => p.status === "active").length;
  const filteredPolicies = policies.filter((p) => {
    if (statusFilter !== "all" && p.status !== statusFilter) {
      return false;
    }
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.policy_id.toLowerCase().includes(q)
    );
  });
  const hasPolicies = policies.length > 0;
  const hasFilteredResults = filteredPolicies.length > 0;

  const populateEditForm = useCallback(() => {
    const detail = detailQuery.data;
    if (!detail || !editPolicyId) return;
    const rule = detail.rules[0];
    if (!rule) return;
    const cond = rule.conditions as {
      rule_type?: string;
      max_amount_usd?: number;
    } | null;
    const ruleType =
      cond?.rule_type === "max_per_tx"
        ? "max_per_tx"
        : cond?.rule_type === "min_per_tx"
          ? "min_per_tx"
          : cond?.rule_type === "max_daily_total"
            ? "max_daily_total"
            : "tool";
    setForm({
      name: detail.policy.name,
      toolPattern: rule.tool_pattern,
      decision:
        rule.decision === "allow"
          ? "allow"
          : rule.decision === "allow_with_obligation"
            ? "allow_with_obligation"
            : "deny",
      ruleType,
      maxAmountUsd: String(
        cond?.max_amount_usd ?? cond?.min_amount_usd ?? "10000",
      ),
    });
  }, [detailQuery.data, editPolicyId]);

  useEffect(() => {
    if (editPolicyId && detailQuery.isSuccess) {
      populateEditForm();
    }
  }, [editPolicyId, detailQuery.isSuccess, populateEditForm]);

  function PolicyFormFields() {
    return (
      <>
        <label className={ui.field}>
          Name
          <input
            className={ui.input}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            autoFocus
          />
        </label>
        <label className={ui.field} style={{ marginTop: "1rem" }}>
          Tool pattern
          <input
            className={ui.input}
            value={form.toolPattern}
            onChange={(e) => setForm((f) => ({ ...f, toolPattern: e.target.value }))}
            placeholder="app.payments.transfer"
          />
        </label>
        <label className={ui.field} style={{ marginTop: "1rem" }}>
          Rule type
          <select
            className={ui.select}
            value={form.ruleType}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                ruleType: e.target.value as PolicyFormState["ruleType"],
              }))
            }
          >
            <option value="tool">When tool matches → allow / deny / require approval</option>
            <option value="max_per_tx">When amount exceeds per-transaction limit</option>
            <option value="min_per_tx">When amount is below minimum per transaction</option>
            <option value="max_daily_total">When daily total exceeds limit</option>
          </select>
        </label>
        {form.ruleType === "tool" ? (
          <>
            <label className={ui.field} style={{ marginTop: "1rem" }}>
              Decision
              <select
                className={ui.select}
                value={form.decision}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    decision: e.target.value as PolicyFormState["decision"],
                  }))
                }
              >
                <option value="allow">Allow (proceed without gate trace)</option>
                <option value="deny">Deny (block and record FAILED trace)</option>
                <option value="allow_with_obligation">
                  Require approval (pause until human approves)
                </option>
              </select>
            </label>
            <p
              style={{
                margin: "0.5rem 0 0",
                fontSize: "0.8125rem",
                color: "var(--console-fg-muted)",
                lineHeight: 1.5,
              }}
            >
              Matches when the tool name equals your pattern (e.g.{" "}
              <code className="mono">app.payments.transfer</code>). No amount check. Use
              the amount rule types below for USD limits.
            </p>
          </>
        ) : (
          <>
            <label className={ui.field} style={{ marginTop: "1rem" }}>
              {form.ruleType === "min_per_tx" ? "Minimum amount (USD)" : "Max amount (USD)"}
              <input
                className={ui.input}
                type="number"
                min={0}
                step="0.01"
                value={form.maxAmountUsd}
                onChange={(e) => setForm((f) => ({ ...f, maxAmountUsd: e.target.value }))}
              />
            </label>
            <label className={ui.field} style={{ marginTop: "1rem" }}>
              When limit {form.ruleType === "min_per_tx" ? "not met" : "exceeded"}
              <select
                className={ui.select}
                value={form.decision === "allow_with_obligation" ? "allow_with_obligation" : "deny"}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    decision: e.target.value as PolicyFormState["decision"],
                  }))
                }
              >
                <option value="deny">Deny (block and record FAILED trace)</option>
                <option value="allow_with_obligation">
                  Require approval (pause for human review)
                </option>
              </select>
            </label>
            <p
              style={{
                margin: "0.5rem 0 0",
                fontSize: "0.8125rem",
                color: "var(--console-fg-muted)",
                lineHeight: 1.5,
              }}
            >
              Applies when Check Policy receives <code className="mono">amount_usd</code>{" "}
              {form.ruleType === "min_per_tx"
                ? "below this minimum."
                : "above this limit."}{" "}
              Pass amount from n8n (Set node before Check Policy).
            </p>
          </>
        )}
        <p
          style={{
            marginTop: "1rem",
            fontSize: "0.8125rem",
            color: "var(--console-fg-subtle)",
            lineHeight: 1.5,
          }}
        >
          <strong>Multiple active policies:</strong> activate as many drafts as you need
          (e.g. max amount, min amount, tool rules). All active policies are enforced
          together. Active policies are immutable; retire or roll back to change.
        </p>
      </>
    );
  }

  return (
    <ConsolePage>
      <PageHeader
        title="Policies"
        subtitle="Draft, review, activate. Multiple policies can be active at once; rules from all active policies are enforced together."
      />

      {draftConflicts.length > 0 ? (
        <div
          className={ui.card}
          style={{
            marginBottom: "1rem",
            padding: "0.875rem 1rem",
            borderColor: "var(--console-warning)",
            background: "color-mix(in srgb, var(--console-warning) 8%, transparent)",
          }}
        >
          <p style={{ margin: 0, fontWeight: 600, fontSize: "0.875rem" }}>
            Draft policy conflicts
          </p>
          <p
            style={{
              margin: "0.35rem 0 0.5rem",
              fontSize: "0.8125rem",
              color: "var(--console-fg-muted)",
            }}
          >
            Multiple drafts target the same tool pattern. Resolve overlaps before
            activating to avoid conflicting decisions.
          </p>
          <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.8125rem" }}>
            {draftConflicts.map((c) => (
              <li key={c.tool_pattern} style={{ marginBottom: "0.25rem" }}>
                <code className="mono">{c.tool_pattern}</code>:{" "}
                {c.drafts.map((d) => d.name).join(", ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div
        className={ui.toolbar}
        style={{ justifyContent: "space-between", marginTop: 0, flexWrap: "wrap", gap: "0.75rem" }}
      >
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", flex: 1 }}>
          <label className={ui.field} style={{ minWidth: "12rem", flex: 1 }}>
            Search
            <input
              className={ui.input}
              placeholder="Policy name or ID…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>
          <label className={ui.field} style={{ minWidth: "9rem" }}>
            Status
            <select
              className={ui.select}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          {activeCount > 0 ? (
            <p
              style={{
                margin: 0,
                alignSelf: "flex-end",
                fontSize: "0.8125rem",
                color: "var(--console-fg-muted)",
                paddingBottom: "0.5rem",
              }}
            >
              {activeCount} active
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className={`${ui.btn} ${ui.btnPrimary}`}
          onClick={() => {
            resetForm();
            setCreateOpen(true);
          }}
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
              Create a <strong>draft</strong>, review rules, then <strong>Activate</strong>.
              You can activate multiple policies at once; their rules combine at runtime.
            </>
          }
          action={
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              onClick={() => setCreateOpen(true)}
            >
              <Plus size={16} aria-hidden />
              Create policy
            </button>
          }
        />
      ) : null}

      {hasPolicies && !hasFilteredResults ? (
        <EmptyStatePanel
          icon={Shield}
          title="No policies match your filters"
          description="Try a different search term or status filter."
        />
      ) : null}

      {hasFilteredResults ? (
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
              {filteredPolicies.map((p) => (
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
                      : "n/a"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.35rem",
                        justifyContent: "flex-end",
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        type="button"
                        className={`${ui.btn} ${ui.btnSecondary}`}
                        title="View rules"
                        onClick={() => setViewPolicyId(p.policy_id)}
                      >
                        <Eye size={14} aria-hidden />
                      </button>
                      {p.status === "draft" ? (
                        <>
                          <button
                            type="button"
                            className={`${ui.btn} ${ui.btnSecondary}`}
                            title="Edit draft"
                            onClick={() => openEdit(p.policy_id)}
                          >
                            <Pencil size={14} aria-hidden />
                          </button>
                          <button
                            type="button"
                            className={`${ui.btn} ${ui.btnSecondary}`}
                            title="Delete draft"
                            onClick={() => setDeletePolicyId(p.policy_id)}
                          >
                            <Trash2 size={14} aria-hidden />
                          </button>
                          <button
                            type="button"
                            className={`${ui.btn} ${ui.btnPrimary}`}
                            onClick={() => activate.mutate(p.policy_id)}
                            disabled={activate.isPending}
                          >
                            Activate
                          </button>
                        </>
                      ) : null}
                      {p.status === "active" ? (
                        <>
                          <span
                            style={{
                              color: "var(--console-fg-subtle)",
                              fontSize: "0.8125rem",
                              alignSelf: "center",
                              paddingInline: "0.25rem",
                            }}
                          >
                            Live
                          </span>
                          <button
                            type="button"
                            className={`${ui.btn} ${ui.btnSecondary}`}
                            onClick={() => setRetirePolicyId(p.policy_id)}
                          >
                            Retire
                          </button>
                        </>
                      ) : null}
                      {p.status === "archived" ? (
                        <button
                          type="button"
                          className={`${ui.btn} ${ui.btnSecondary}`}
                          onClick={() => activate.mutate(p.policy_id)}
                          disabled={activate.isPending}
                          title="Roll back to this version"
                        >
                          Roll back
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Modal
        open={createOpen}
        title="Create policy draft"
        description="Drafts can be edited or deleted before activation."
        closeOnOverlayClick={false}
        onClose={() => {
          if (!createPolicy.isPending) setCreateOpen(false);
        }}
        footer={
          <>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              onClick={() => setCreateOpen(false)}
              disabled={createPolicy.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              disabled={
                createPolicy.isPending || !form.name.trim() || !form.toolPattern.trim()
              }
              onClick={() => createPolicy.mutate()}
            >
              {createPolicy.isPending ? "Creating…" : "Create draft"}
            </button>
          </>
        }
      >
        <PolicyFormFields />
        {createPolicy.isError ? (
          <ErrorAlert message={(createPolicy.error as Error).message} />
        ) : null}
      </Modal>

      <Modal
        open={Boolean(editPolicyId)}
        title="Edit policy draft"
        description="Only draft policies can be edited. Activate when ready."
        closeOnOverlayClick={false}
        onClose={() => {
          if (!updatePolicy.isPending) {
            setEditPolicyId(null);
            resetForm();
          }
        }}
        footer={
          <>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              onClick={() => {
                setEditPolicyId(null);
                resetForm();
              }}
              disabled={updatePolicy.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              disabled={
                updatePolicy.isPending || !form.name.trim() || !form.toolPattern.trim()
              }
              onClick={() => editPolicyId && updatePolicy.mutate(editPolicyId)}
            >
              {updatePolicy.isPending ? "Saving…" : "Save draft"}
            </button>
          </>
        }
      >
        {detailQuery.isLoading && editPolicyId ? <LoadingBlock /> : <PolicyFormFields />}
        {updatePolicy.isError ? (
          <ErrorAlert message={(updatePolicy.error as Error).message} />
        ) : null}
      </Modal>

      <Modal
        open={Boolean(viewPolicyId)}
        title={detailQuery.data?.policy.name ?? "Policy details"}
        description={detailQuery.data?.policy.policy_id}
        wide
        closeOnOverlayClick={false}
        onClose={() => setViewPolicyId(null)}
        footer={
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            onClick={() => setViewPolicyId(null)}
          >
            Close
          </button>
        }
      >
        {detailQuery.isLoading ? <LoadingBlock /> : null}
        {detailQuery.data ? (
          <>
            <p style={{ marginBottom: "1rem", color: "var(--console-fg-muted)" }}>
              Version {detailQuery.data.policy.version} ·{" "}
              <StatusBadge status={detailQuery.data.policy.status} />
              {detailQuery.data.policy.activated_at
                ? ` · Activated ${new Date(detailQuery.data.policy.activated_at).toLocaleString()}`
                : null}
            </p>
            <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
              {detailQuery.data.rules.map((rule) => (
                <li key={rule.rule_id} className="mono" style={{ marginBottom: "0.5rem" }}>
                  {ruleSummary(rule)}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(deletePolicyId)}
        title="Delete draft?"
        description="This permanently removes the draft. Active and archived policies cannot be deleted."
        onClose={() => setDeletePolicyId(null)}
        footer={
          <>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              onClick={() => setDeletePolicyId(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              disabled={deletePolicy.isPending}
              onClick={() => deletePolicyId && deletePolicy.mutate(deletePolicyId)}
            >
              {deletePolicy.isPending ? "Deleting…" : "Delete draft"}
            </button>
          </>
        }
      >
        {deletePolicy.isError ? (
          <ErrorAlert message={(deletePolicy.error as Error).message} />
        ) : null}
      </Modal>

      <Modal
        open={Boolean(retirePolicyId)}
        title="Retire active policy?"
        description="This policy will stop being enforced. Other active policies remain in effect."
        onClose={() => setRetirePolicyId(null)}
        footer={
          <>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              onClick={() => setRetirePolicyId(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              disabled={archivePolicy.isPending}
              onClick={() => retirePolicyId && archivePolicy.mutate(retirePolicyId)}
            >
              {archivePolicy.isPending ? "Retiring…" : "Retire policy"}
            </button>
          </>
        }
      >
        {archivePolicy.isError ? (
          <ErrorAlert message={(archivePolicy.error as Error).message} />
        ) : null}
      </Modal>
    </ConsolePage>
  );
}
