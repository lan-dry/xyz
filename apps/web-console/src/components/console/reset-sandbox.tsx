"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ApiError, consoleApi } from "@/lib/api";
import { idApi } from "@/lib/id-api";
import { canManageOrg } from "@/lib/org-roles";
import { useSandboxStatus } from "@/lib/tenant-copy";
import type { MeResponse } from "@/lib/types";

import { ErrorAlert, ui } from "./console-ui";
import { Modal } from "./modal";

type ResetResult = { ok: boolean; message: string };

/**
 * Sandbox-only wipe control. Admins type the org name (or RESET SANDBOX) to confirm.
 * Hidden for real/demo tenants and non-admins.
 */
export function ResetSandboxPanel({
  compact = false,
}: {
  /** Compact button for checklist / test-sender footers. */
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const status = useSandboxStatus();
  const meQuery = useQuery({
    queryKey: ["id", "me"],
    queryFn: () => idApi<MeResponse>("/auth/me"),
  });
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");

  const isSandbox = status.data?.is_sandbox === true;
  const isAdmin = canManageOrg(meQuery.data?.user?.role);
  const orgName = meQuery.data?.organization?.name?.trim() || "";

  const reset = useMutation({
    mutationFn: () =>
      consoleApi<ResetResult>("/sandbox/reset", {
        method: "POST",
        body: JSON.stringify({ confirm_name: confirmName.trim() }),
      }),
    onSuccess: async () => {
      setOpen(false);
      setConfirmName("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["console", "sandbox"] }),
        queryClient.invalidateQueries({ queryKey: ["console", "traces"] }),
        queryClient.invalidateQueries({ queryKey: ["console", "overview"] }),
        queryClient.invalidateQueries({ queryKey: ["console", "approvals"] }),
        queryClient.invalidateQueries({ queryKey: ["console", "ingest-keys"] }),
      ]);
    },
  });

  if (!isSandbox || !isAdmin) return null;

  const expected = orgName || "your organisation name";
  const confirmOk =
    (orgName &&
      confirmName.trim().localeCompare(orgName, undefined, {
        sensitivity: "accent",
      }) === 0) ||
    confirmName.trim().toUpperCase() === "RESET SANDBOX";

  return (
    <div>
      {!compact ? (
        <>
          <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.35rem" }}>Reset sandbox</h2>
          <p className={ui.cardHint} style={{ marginTop: 0 }}>
            Wipe all events, cases, approvals and evidence. Your login and teammates stay.
            The checklist starts over and the 30-day clock restarts.
          </p>
        </>
      ) : null}
      <button
        type="button"
        className={`${ui.btn} ${ui.btnSecondary}`}
        onClick={() => {
          setConfirmName("");
          setOpen(true);
        }}
      >
        Reset sandbox
      </button>
      {reset.data && !open ? (
        <p className={ui.cardHint} style={{ marginTop: "0.5rem" }}>
          {reset.data.message}
        </p>
      ) : null}

      <Modal
        open={open}
        title="Reset sandbox?"
        description="This clears every sealed case in this sandbox. Type the organisation name to confirm."
        closeOnOverlayClick={false}
        onClose={() => {
          if (!reset.isPending) setOpen(false);
        }}
        footer={
          <>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              disabled={reset.isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              disabled={!confirmOk || reset.isPending}
              onClick={() => reset.mutate()}
            >
              {reset.isPending ? "Resetting…" : "Reset sandbox"}
            </button>
          </>
        }
      >
        <label className={ui.field}>
          Type <strong>{expected}</strong> or <strong>RESET SANDBOX</strong>
          <input
            className={ui.input}
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder={expected}
          />
        </label>
        {reset.isError ? (
          <div style={{ marginTop: "0.75rem" }}>
            <ErrorAlert
              message={
                reset.error instanceof ApiError
                  ? reset.error.message
                  : "Sandbox reset failed."
              }
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
