"use client";

import Link from "next/link";
import { Search, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { OpsPagination } from "@/components/ops-pagination";
import { OpsShell } from "@/components/ops-shell";
import { EmptyStatePanel, ui } from "@/components/ops-ui/ops-ui";
import { useOpsListParams } from "@/hooks/use-ops-list-params";
import { usePlatformSession } from "@/hooks/use-platform-session";
import { platformRoleLabel } from "@/lib/platform-permissions";
import { platformApi } from "@/lib/platform-api";

type AccountRow = {
  account_id: string;
  email: string;
  display_name: string | null;
  active: boolean;
  platform_role: "superadmin" | "admin" | "staff" | null;
  memberships: Array<{ org_name: string; role: string; status: string }>;
};

export default function AccountsPage() {
  const { email, logout, can } = usePlatformSession();
  const canWriteAccounts = can("platform:accounts.write");
  const { q, limit, page, offset, setQuery, setPage, setLimit } = useOpsListParams(25);
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

  const usersQuery = useQuery({
    queryKey: ["platform", "users", q, limit, offset],
    queryFn: () =>
      platformApi<{
        accounts: AccountRow[];
        total: number;
      }>(`accounts?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`),
  });

  const patchAccount = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      platformApi(`/accounts/${encodeURIComponent(input.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ active: input.active }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform", "users"] });
    },
  });

  const accounts = usersQuery.data?.accounts ?? [];
  const total = usersQuery.data?.total ?? 0;

  function profileHref(accountId: string) {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (q) params.set("q", q);
    const list = `/accounts?${params.toString()}`;
    return `/accounts/${accountId}?return=${encodeURIComponent(list)}`;
  }

  return (
    <OpsShell
      title="Accounts"
      subtitle="Global user list across all organizations."
      staffEmail={email}
      onLogout={logout}
    >
      <div className={ui.toolbar}>
        <div className={ui.searchWrap}>
          <Search className={ui.searchIcon} size={16} aria-hidden />
          <input
            className={`${ui.input} ${ui.searchInput}`}
            placeholder="Search by email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search accounts"
          />
        </div>
      </div>

      {usersQuery.isLoading ? (
        <p className={ui.loading}>Loading accounts…</p>
      ) : accounts.length === 0 ? (
        <EmptyStatePanel
          icon={Users}
          title={q ? "No matching accounts" : "No accounts yet"}
          description={
            q
              ? "Try a different email search."
              : "Accounts appear when you provision organizations or users accept invites."
          }
        />
      ) : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Email</th>
                <th>Platform role</th>
                <th>Memberships</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.account_id}>
                  <td>
                    <Link href={profileHref(a.account_id)} className={ui.tableLink}>
                      {a.email}
                    </Link>
                    {a.display_name ? (
                      <div style={{ fontSize: "0.8125rem", color: "var(--console-fg-muted)" }}>
                        {a.display_name}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ fontSize: "0.8125rem" }}>
                    {platformRoleLabel(a.platform_role)}
                  </td>
                  <td style={{ color: "var(--console-fg-muted)", fontSize: "0.8125rem" }}>
                    {a.memberships.length === 0
                      ? "—"
                      : a.memberships.length > 2
                        ? `${a.memberships.length} orgs`
                        : a.memberships.map((m) => `${m.org_name} (${m.role})`).join(" · ")}
                  </td>
                  <td>{a.active ? "Active" : "Suspended"}</td>
                  <td>
                    <div className={ui.formRow}>
                      <Link
                        href={profileHref(a.account_id)}
                        className={`${ui.btn} ${ui.btnSecondary}`}
                      >
                        Profile
                      </Link>
                      {canWriteAccounts ? (
                        <button
                          type="button"
                          className={`${ui.btn} ${ui.btnSecondary}`}
                          onClick={() =>
                            patchAccount.mutate({ id: a.account_id, active: !a.active })
                          }
                        >
                          {a.active ? "Suspend" : "Activate"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <OpsPagination
            total={total}
            limit={limit}
            page={page}
            onPageChange={setPage}
            onLimitChange={setLimit}
          />
        </div>
      )}
    </OpsShell>
  );
}
