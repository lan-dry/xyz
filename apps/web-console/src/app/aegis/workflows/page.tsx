"use client";

import Link from "next/link";
import { GitBranch, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AegisMark } from "@/components/console/aegis-mark";
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
import {
  environmentLabel,
  readConsoleEnvironment,
  type ConsoleEnvironment,
} from "@/lib/console-environment";

type WorkflowRow = {
  workflow_id: string;
  name: string;
  description: string | null;
  environment: string;
  agent_id: string | null;
  policy_ids: string[];
  coverage_pct: number | null;
  evidence_readiness_pct: number | null;
};

export default function WorkflowsPage() {
  const queryClient = useQueryClient();
  const [environment, setEnvironment] = useState<ConsoleEnvironment>("production");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setEnvironment(readConsoleEnvironment());
    function onEnv(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail === "sandbox" || detail === "production") setEnvironment(detail);
    }
    window.addEventListener("salanor:console-environment", onEnv);
    return () => window.removeEventListener("salanor:console-environment", onEnv);
  }, []);

  const listQuery = useQuery({
    queryKey: ["console", "workflows", environment],
    queryFn: () =>
      consoleApi<{ workflows: WorkflowRow[]; error?: string }>(
        `/workflows?environment=${environment}&ensure=merchant-payouts`,
      ),
  });

  const createMutation = useMutation({
    mutationFn: (input: { name: string; description?: string }) =>
      consoleApi<{ workflow: WorkflowRow }>("/workflows", {
        method: "POST",
        body: JSON.stringify({
          name: input.name,
          description: input.description || undefined,
          environment,
        }),
      }),
    onSuccess: () => {
      setCreateOpen(false);
      setName("");
      setDescription("");
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ["console", "workflows"] });
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "Could not create workflow");
    },
  });

  const workflows = listQuery.data?.workflows ?? [];
  const migrateHint =
    listQuery.data?.error?.includes("migration") ||
    (listQuery.error instanceof Error &&
      listQuery.error.message.includes("503"));

  function openCreate(preset?: { name: string; description: string }) {
    setName(preset?.name ?? "");
    setDescription(preset?.description ?? "");
    setFormError(null);
    setCreateOpen(true);
  }

  function submitCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Name is required");
      return;
    }
    createMutation.mutate({
      name: trimmed,
      description: description.trim() || undefined,
    });
  }

  return (
    <ConsolePage>
      <PageHeader
        title="Workflows"
        subtitle={
          <>
            Governed units for <strong>{environmentLabel(environment)}</strong>. Each
            workflow links an agent, policy bundle, and evidence readiness score.
          </>
        }
        actions={
          <button
            type="button"
            className={`${ui.btn} ${ui.btnPrimary}`}
            onClick={() => openCreate()}
          >
            <Plus size={14} aria-hidden /> New workflow
          </button>
        }
      />

      {listQuery.isPending ? <LoadingBlock /> : null}
      {listQuery.error ? (
        <ErrorAlert
          message={
            migrateHint
              ? "Workflows need migration 007. Run pnpm db:migrate, then refresh."
              : "Failed to load workflows."
          }
        />
      ) : null}

      {!listQuery.isPending && !listQuery.error && workflows.length === 0 ? (
        <EmptyStatePanel
          mark={<AegisMark />}
          title="No workflows yet"
          description="Create Merchant payouts to link your payout agent and policy bundle, or name any governed path."
          action={
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              onClick={() =>
                openCreate({
                  name: "Merchant payouts",
                  description:
                    "Governed payout path: agent → policy pause → human approve → sealed receipt.",
                })
              }
            >
              Create Merchant payouts
            </button>
          }
        />
      ) : null}

      {workflows.length > 0 ? (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Workflow</th>
                <th>Agent</th>
                <th>Policies</th>
                <th>Coverage</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((w) => (
                <tr key={w.workflow_id}>
                  <td>
                    <Link
                      href={`/aegis/workflows/${encodeURIComponent(w.workflow_id)}`}
                      className={ui.tableLink}
                      style={{
                        fontWeight: 600,
                        display: "inline-flex",
                        gap: "0.35rem",
                        alignItems: "center",
                      }}
                    >
                      <GitBranch size={14} aria-hidden />
                      {w.name}
                    </Link>
                    {w.description ? (
                      <p className={ui.cardHint} style={{ margin: "0.25rem 0 0" }}>
                        {w.description}
                      </p>
                    ) : null}
                  </td>
                  <td className="mono" style={{ fontSize: "0.8125rem" }}>
                    {w.agent_id ?? "-"}
                  </td>
                  <td>{w.policy_ids.length}</td>
                  <td>{w.coverage_pct != null ? `${w.coverage_pct}%` : "-"}</td>
                  <td>
                    {w.evidence_readiness_pct != null
                      ? `${w.evidence_readiness_pct}%`
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Modal
        open={createOpen}
        title="New workflow"
        description="Name a governed path for this environment. Names must be unique (Merchant payouts is only the Northwind demo seed)."
        onClose={() => setCreateOpen(false)}
        closeOnOverlayClick={false}
        footer={
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnGhost}`}
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              disabled={createMutation.isPending}
              onClick={submitCreate}
            >
              {createMutation.isPending ? "Creating..." : "Create"}
            </button>
          </div>
        }
      >
        <form
          className={ui.formGrid}
          onSubmit={(e) => {
            e.preventDefault();
            submitCreate();
          }}
        >
          <label className={ui.field}>
            Name
            <input
              className={ui.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Refunds"
              autoFocus
              required
            />
          </label>
          <label className={ui.field}>
            Description (optional)
            <textarea
              className={ui.input}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What this governed path covers"
            />
          </label>
          {formError ? <ErrorAlert message={formError} /> : null}
        </form>
      </Modal>
    </ConsolePage>
  );
}
