"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { OpsPage, PageHeader, ui } from "@/components/ops-ui/ops-ui";
import { platformApi } from "@/lib/platform-api";

type AccessRequest = {
  request_id: string;
  work_email: string;
  company: string;
  role_title: string;
  country: string;
  use_case: string;
  status: string;
  created_at: string;
};

type ApproveResult = {
  ok?: boolean;
  organization_id?: string;
  slug?: string;
  invitation_id?: string | null;
  invite_url?: string | null;
  email_delivered?: boolean;
  message?: string;
  invite_error?: string;
};

type RejectResult = {
  ok?: boolean;
  email_delivered?: boolean;
  message?: string;
};

export default function AccessRequestsPage() {
  const qc = useQueryClient();
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["ops", "access-requests"],
    queryFn: () =>
      platformApi<{ requests: AccessRequest[] }>("/access-requests?status=pending"),
  });
  const approve = useMutation({
    mutationFn: (id: string) =>
      platformApi<ApproveResult>(`/access-requests/${encodeURIComponent(id)}/approve`, {
        method: "POST",
        body: "{}",
      }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["ops", "access-requests"] });
      setActionNote(data.message ?? "Sandbox created.");
      setLastInviteUrl(
        data.email_delivered ? null : (data.invite_url ?? null),
      );
    },
    onError: (err: Error) => {
      setActionNote(err.message || "Approve failed.");
      setLastInviteUrl(null);
    },
  });
  const reject = useMutation({
    mutationFn: (id: string) =>
      platformApi<RejectResult>(`/access-requests/${encodeURIComponent(id)}/reject`, {
        method: "POST",
        body: JSON.stringify({
          note: "Thank you for your interest. We cannot offer a sandbox at this time.",
        }),
      }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["ops", "access-requests"] });
      setActionNote(data.message ?? "Request rejected.");
      setLastInviteUrl(null);
    },
    onError: (err: Error) => {
      setActionNote(err.message || "Reject failed.");
      setLastInviteUrl(null);
    },
  });

  return (
    <OpsPage>
      <PageHeader
        title="Access requests"
        subtitle="People who asked for a sandbox. Approve creates the organisation and emails an invite; reject sends a polite close."
      />
      {actionNote ? (
        <div
          role="status"
          style={{
            marginBottom: "1rem",
            padding: "0.75rem 1rem",
            border: "1px solid var(--border, #d5ddd8)",
            borderRadius: 8,
            background: "var(--surface, #f7f9f8)",
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          <div>{actionNote}</div>
          {lastInviteUrl ? (
            <div style={{ marginTop: 8 }}>
              Invite URL (share manually):{" "}
              <a href={lastInviteUrl} style={{ wordBreak: "break-all" }}>
                {lastInviteUrl}
              </a>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={ui.tableWrap}>
        <table className={ui.table}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Company</th>
              <th>Role</th>
              <th>Country</th>
              <th>Use case</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(list.data?.requests ?? []).map((r) => (
              <tr key={r.request_id}>
                <td>{r.work_email}</td>
                <td>{r.company}</td>
                <td>{r.role_title}</td>
                <td>{r.country}</td>
                <td style={{ maxWidth: 280 }}>{r.use_case}</td>
                <td style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className={`${ui.btn} ${ui.btnPrimary}`}
                    disabled={approve.isPending || reject.isPending}
                    onClick={() => approve.mutate(r.request_id)}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className={`${ui.btn} ${ui.btnSecondary}`}
                    disabled={approve.isPending || reject.isPending}
                    onClick={() => reject.mutate(r.request_id)}
                  >
                    Reject
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </OpsPage>
  );
}
