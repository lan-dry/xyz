"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export default function AccessRequestsPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["ops", "access-requests"],
    queryFn: () =>
      platformApi<{ requests: AccessRequest[] }>("/access-requests?status=pending"),
  });
  const approve = useMutation({
    mutationFn: (id: string) =>
      platformApi(`/access-requests/${encodeURIComponent(id)}/approve`, {
        method: "POST",
        body: "{}",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops", "access-requests"] }),
  });
  const reject = useMutation({
    mutationFn: (id: string) =>
      platformApi(`/access-requests/${encodeURIComponent(id)}/reject`, {
        method: "POST",
        body: JSON.stringify({ note: "Thank you for your interest. We cannot offer a sandbox at this time." }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops", "access-requests"] }),
  });

  return (
    <OpsPage>
      <PageHeader
        title="Access requests"
        subtitle="People who asked for a sandbox. Approve creates the organisation; reject sends a polite close."
      />
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
                    onClick={() => approve.mutate(r.request_id)}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className={`${ui.btn} ${ui.btnSecondary}`}
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
