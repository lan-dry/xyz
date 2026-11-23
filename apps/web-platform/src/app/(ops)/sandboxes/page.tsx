"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { OpsPage, PageHeader, ui } from "@/components/ops-ui/ops-ui";
import { platformApi } from "@/lib/platform-api";

type SandboxRow = {
  organization_id: string;
  name: string;
  slug: string;
  sandbox_expires_at: string | null;
  sandbox_extensions: number;
  sandbox_archived_at: string | null;
  event_quota_daily: number | null;
  created_at: string;
};

export default function SandboxesPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["ops", "sandboxes"],
    queryFn: () => platformApi<{ sandboxes: SandboxRow[] }>("/sandboxes"),
  });
  const extend = useMutation({
    mutationFn: (id: string) =>
      platformApi(`/sandboxes/${encodeURIComponent(id)}/extend`, { method: "POST", body: "{}" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops", "sandboxes"] }),
  });
  const suspend = useMutation({
    mutationFn: (id: string) =>
      platformApi(`/sandboxes/${encodeURIComponent(id)}/suspend`, { method: "POST", body: "{}" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops", "sandboxes"] }),
  });

  return (
    <OpsPage>
      <PageHeader
        title="Sandboxes"
        subtitle="Self-serve sandbox organisations. Synthetic data only. Extend, suspend, or review usage."
      />
      {list.isError ? <p className={ui.err}>Could not load sandboxes.</p> : null}
      <div className={ui.tableWrap}>
        <table className={ui.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Slug</th>
              <th>Expires</th>
              <th>Extensions</th>
              <th>Quota / day</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(list.data?.sandboxes ?? []).map((s) => (
              <tr key={s.organization_id}>
                <td>{s.name}</td>
                <td>{s.slug}</td>
                <td>{s.sandbox_expires_at?.replace("T", " ").slice(0, 16) ?? "—"}</td>
                <td>{s.sandbox_extensions}</td>
                <td>{s.event_quota_daily ?? "—"}</td>
                <td style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className={`${ui.btn} ${ui.btnSecondary}`}
                    onClick={() => extend.mutate(s.organization_id)}
                    disabled={Boolean(s.sandbox_archived_at)}
                  >
                    Extend 30 days
                  </button>
                  <button
                    type="button"
                    className={`${ui.btn} ${ui.btnSecondary}`}
                    onClick={() => suspend.mutate(s.organization_id)}
                  >
                    Suspend
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
