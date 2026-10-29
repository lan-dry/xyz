"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Suspense, useState } from "react";

import {
  ConsolePage,
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  ui,
} from "@/components/console/console-ui";
import { consoleApi } from "@/lib/api";

function ActInner() {
  const search = useSearchParams();
  const token = search.get("token")?.trim() ?? "";
  const [done, setDone] = useState<{
    decision: string;
    approval_id: string;
  } | null>(null);
  const [reason, setReason] = useState("");

  const decide = useMutation({
    mutationFn: () =>
      consoleApi<{
        approval: { approval_id: string; status: string };
      }>("/approvals/act", {
        method: "POST",
        body: JSON.stringify({
          token,
          reason: reason.trim() || undefined,
        }),
      }),
    onSuccess: (data) => {
      setDone({
        decision: data.approval.status,
        approval_id: data.approval.approval_id,
      });
    },
  });

  if (!token) {
    return (
      <ConsolePage>
        <PageHeader title="Approval link" subtitle="Missing token." />
        <ErrorAlert message="This approval link is incomplete. Open Approvals from the Console." />
        <Link href="/aegis/approvals" className={`${ui.btn} ${ui.btnPrimary}`}>
          Open Approvals
        </Link>
      </ConsolePage>
    );
  }

  if (done) {
    const approved = done.decision === "approved";
    return (
      <ConsolePage>
        <PageHeader
          title={approved ? "Approved" : "Declined"}
          subtitle="Recorded from your notification link. Resume the agent if it is waiting."
        />
        <p className={`${ui.alert} ${approved ? ui.alertSuccess : ui.alertError}`}>
          {approved
            ? "The held action may continue. If the pilot asked for a resume command, run it with the approval id."
            : "The held action was declined and will not run."}
        </p>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link href="/aegis/approvals" className={`${ui.btn} ${ui.btnPrimary}`}>
            Approvals
          </Link>
          <Link href="/aegis/traces" className={`${ui.btn} ${ui.btnSecondary}`}>
            Cases
          </Link>
        </div>
      </ConsolePage>
    );
  }

  return (
    <ConsolePage>
      <PageHeader
        title="Decide from Slack"
        subtitle="Confirm Approve or Decline. Decline should include a short reason."
      />
      {decide.error ? (
        <ErrorAlert message={(decide.error as Error).message} />
      ) : null}
      <label className={ui.field} style={{ display: "block", marginBottom: "1rem" }}>
        Reason (required to Decline; recommended for Approve)
        <textarea
          className={ui.input}
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Customer has a clean history / Duplicate request"
        />
      </label>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className={`${ui.btn} ${ui.btnPrimary}`}
          disabled={decide.isPending}
          onClick={() => decide.mutate()}
        >
          {decide.isPending ? "Saving…" : "Confirm decision"}
        </button>
        <Link href="/aegis/approvals" className={`${ui.btn} ${ui.btnSecondary}`}>
          Cancel and open inbox
        </Link>
      </div>
      <p style={{ marginTop: "1rem", fontSize: "0.8125rem", color: "var(--console-fg-muted)" }}>
        The link already encodes Approve or Decline from the Slack button you tapped.
      </p>
    </ConsolePage>
  );
}

export default function ApprovalActPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ActInner />
    </Suspense>
  );
}
