"use client";

import { Building2, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { OpsShell } from "@/components/ops-shell";
import { EmptyStatePanel, ui } from "@/components/ops-ui/ops-ui";
import { useOpsListParams } from "@/hooks/use-ops-list-params";
import { usePlatformSession } from "@/hooks/use-platform-session";
import { platformApi } from "@/lib/platform-api";
import { CONSOLE_URL } from "@/lib/urls";

type OrgRow = {
  organization_id: string;
  name: string;
  slug: string;
  plan: string;
  active: boolean;
  member_count: number;
  events_this_month: number;
};

export default function OrganizationsPage() {
  const { email, logout, can } = usePlatformSession();
  const canWriteOrgs = can("platform:orgs.write");
  const canImpersonate = can("platform:impersonate");
  const { q, setQuery } = useOpsListParams();
  const [searchInput, setSearchInput] = useState(q);
  const queryClient = useQueryClient();

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (searchInput !== q) setQuery(searchInput);
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchInput, q, setQuery]);

  const orgsQuery = useQuery({
    queryKey: ["platform", "orgs", q],
    queryFn: () =>
      platformApi<{ organizations: OrgRow[] }>(
        `organizations?q=${encodeURIComponent(q)}`,
      ),
  });

  const patchOrg = useMutation({
    mutationFn: (input: { id: string; plan?: string; active?: boolean }) =>
      platformApi(`/organizations/${encodeURIComponent(input.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ plan: input.plan, active: input.active }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform", "orgs"] });
    },
  });

  const impersonate = useMutation({
    mutationFn: (organizationId: string) =>
      platformApi<{ handoff_token: string; redirect_url: string }>(
        `organizations/${encodeURIComponent(organizationId)}/impersonate`,
        { method: "POST" },
      ),
    onSuccess: (data) => {
      const form = document.createElement("form");
      form.method = "POST";
      form.action = `${CONSOLE_URL}/api/id/auth/handoff`;
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "token";
      input.value = data.handoff_token;
      form.appendChild(input);
      document.body.appendChild(form);
      form.submit();
    },
  });

  const orgs = orgsQuery.data?.organizations ?? [];

  return (
    <OpsShell
      title="Organizations"
      subtitle="All customer tenants — change plan or suspend."
      staffEmail={email}
      onLogout={logout}
    >
      <div className={ui.toolbar}>
        <div className={ui.searchWrap}>
          <Search className={ui.searchIcon} size={16} aria-hidden />
          <input
            className={`${ui.input} ${ui.searchInput}`}
            placeholder="Search by name or slug…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search organizations"
          />
        </div>
      </div>

      {orgsQuery.isError ? (
        <p className={ui.loading} style={{ color: "var(--console-danger)" }}>
          Could not load organizations.
        </p>
      ) : null}
      {impersonate.isError ? (
        <p style={{ color: "var(--console-danger)", margin: "0 0 1rem", fontSize: "0.875rem" }}>
          {(impersonate.error as Error).message}
        </p>
      ) : null}

      {orgsQuery.isLoading ? (
        <p className={ui.loading}>Loading organizations…</p>
      ) : orgs.length === 0 ? (
        <EmptyStatePanel
          icon={Building2}
          title={q ? "No matching organizations" : "No organizations yet"}
          description={
            q ? "Try another search." : "Provision a design partner to create the first org."
          }
          action={
            !q ? (
              <a href="/provision" className={`${ui.btn} ${ui.btnPrimary}`}>
                Provision org
              </a>
            ) : undefined
          }
        />
      ) : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Organization</th>
                <th>Plan</th>
                <th>Members</th>
                <th>Events (month)</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.organization_id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{o.name}</div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--console-fg-muted)" }}>
                      {o.slug}
                    </div>
                  </td>
                  <td>
                    <select
                      className={ui.select}
                      style={{ minWidth: "6.5rem" }}
                      defaultValue={o.plan}
                      disabled={!canWriteOrgs}
                      onChange={(e) =>
                        patchOrg.mutate({ id: o.organization_id, plan: e.target.value })
                      }
                    >
                      <option value="free">free</option>
                      <option value="team">team</option>
                      <option value="enterprise">enterprise</option>
                    </select>
                  </td>
                  <td>{o.member_count}</td>
                  <td>{o.events_this_month}</td>
                  <td>{o.active ? "Active" : "Suspended"}</td>
                  <td>
                    <div className={ui.formRow}>
                      {canImpersonate && o.active ? (
                        <button
                          type="button"
                          className={`${ui.btn} ${ui.btnPrimary}`}
                          disabled={impersonate.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Open ${o.name} in the customer console as support (audited)?`,
                              )
                            ) {
                              impersonate.mutate(o.organization_id);
                            }
                          }}
                        >
                          {impersonate.isPending ? "Opening…" : "View in console"}
                        </button>
                      ) : null}
                      {canWriteOrgs ? (
                        <button
                          type="button"
                          className={`${ui.btn} ${ui.btnSecondary}`}
                          onClick={() =>
                            patchOrg.mutate({ id: o.organization_id, active: !o.active })
                          }
                        >
                          {o.active ? "Suspend" : "Activate"}
                        </button>
                      ) : null}
                      {!canImpersonate && !canWriteOrgs ? "—" : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </OpsShell>
  );
}
