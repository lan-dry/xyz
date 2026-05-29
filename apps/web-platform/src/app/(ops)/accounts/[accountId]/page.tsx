"use client";

import { Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { OpsShell } from "@/components/ops-shell";
import card from "@/components/ops-ui/setting-card.module.css";
import { ErrorAlert, LoadingBlock, OpsBackLink, ui } from "@/components/ops-ui/ops-ui";
import { usePlatformSession } from "@/hooks/use-platform-session";
import { platformRoleLabel, platformRoleOptionsForActor } from "@/lib/platform-permissions";
import { platformApi } from "@/lib/platform-api";

type PlatformRoleValue = "superadmin" | "admin" | "staff" | null;

type AccountDetail = {
  account_id: string;
  email: string;
  display_name: string | null;
  active: boolean;
  platform_role: PlatformRoleValue;
  created_at: string;
  updated_at: string;
  memberships: Array<{
    membership_id: string;
    organization_id: string;
    org_name: string;
    org_slug: string;
    role: string;
    status: string;
  }>;
};


export default function AccountProfilePage() {
  const params = useParams<{ accountId: string }>();
  const router = useRouter();
  const accountId = params.accountId;
  const { email, logout, can, platformRole: actorPlatformRole } = usePlatformSession();
  const queryClient = useQueryClient();

  const accountQuery = useQuery({
    queryKey: ["platform", "account", accountId],
    queryFn: () => platformApi<{ account: AccountDetail }>(`accounts/${accountId}`),
    enabled: Boolean(accountId),
  });

  const patchAccount = useMutation({
    mutationFn: (active: boolean) =>
      platformApi(`/accounts/${accountId}`, {
        method: "PATCH",
        body: JSON.stringify({ active }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform", "account", accountId] });
      void queryClient.invalidateQueries({ queryKey: ["platform", "users"] });
    },
  });

  const resetPassword = useMutation({
    mutationFn: (password: string) =>
      platformApi(`/accounts/${accountId}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password }),
      }),
  });

  const setPlatformRole = useMutation({
    mutationFn: (platform_role: PlatformRoleValue) =>
      platformApi<{ platform_role: PlatformRoleValue }>(
        `/accounts/${accountId}/platform-role`,
        {
          method: "PATCH",
          body: JSON.stringify({ platform_role }),
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform", "account", accountId] });
      void queryClient.invalidateQueries({ queryKey: ["platform", "users"] });
      void queryClient.invalidateQueries({ queryKey: ["platform", "audit-logs"] });
    },
  });

  const account = accountQuery.data?.account;
  const canWriteAccount = can("platform:accounts.write");
  const canWriteRole = can("platform:roles.write");
  const roleOptions =
    actorPlatformRole && account
      ? platformRoleOptionsForActor(actorPlatformRole, account.platform_role)
      : [];
  const roleDropdownDisabled =
    !canWriteRole ||
    !actorPlatformRole ||
    roleOptions.length === 0 ||
    (account?.platform_role === "superadmin" && actorPlatformRole !== "superadmin");

  return (
    <OpsShell
      title={account?.email ?? "Account profile"}
      subtitle={account?.display_name ?? undefined}
      staffEmail={email}
      onLogout={logout}
      actions={
        <Suspense fallback={null}>
          <OpsBackLink fallback="/accounts">← Back</OpsBackLink>
        </Suspense>
      }
    >
      {accountQuery.isPending ? (
        <LoadingBlock />
      ) : accountQuery.isError || !account ? (
        <ErrorAlert message="Account not found." />
      ) : (
        <>
          <section className={card.settingCard}>
            <h2>Account</h2>
            <dl className={ui.formGrid} style={{ maxWidth: "28rem", gap: "0.75rem" }}>
              <div>
                <dt style={{ fontSize: "0.75rem", color: "var(--console-fg-muted)" }}>Status</dt>
                <dd style={{ margin: "0.25rem 0 0", fontWeight: 600 }}>
                  {account.active ? "Active" : "Suspended"}
                </dd>
              </div>
              <div>
                <dt style={{ fontSize: "0.75rem", color: "var(--console-fg-muted)" }}>
                  Platform role
                </dt>
                <dd style={{ margin: "0.25rem 0 0", fontWeight: 600 }}>
                  {platformRoleLabel(account.platform_role)}
                </dd>
              </div>
              <div>
                <dt style={{ fontSize: "0.75rem", color: "var(--console-fg-muted)" }}>Created</dt>
                <dd style={{ margin: "0.25rem 0 0" }}>
                  {new Date(account.created_at).toLocaleString()}
                </dd>
              </div>
            </dl>

            {canWriteRole && actorPlatformRole ? (
              <div className={ui.formRow} style={{ marginTop: "1rem", flexDirection: "column", alignItems: "stretch", maxWidth: "20rem" }}>
                <label htmlFor="platform-role" style={{ fontSize: "0.75rem", color: "var(--console-fg-muted)" }}>
                  Change platform role
                  {actorPlatformRole !== "superadmin"
                    ? " (only super admin can grant super admin)"
                    : ""}
                </label>
                <select
                  id="platform-role"
                  className={ui.input}
                  value={account.platform_role ?? ""}
                  disabled={roleDropdownDisabled || setPlatformRole.isPending}
                  onChange={(e) => {
                    const v = e.target.value;
                    const next: PlatformRoleValue =
                      v === "" ? null : (v as "superadmin" | "admin" | "staff");
                    if (
                      !window.confirm(
                        `Set platform role to ${roleOptions.find((o) => o.value === next)?.label ?? "none"}?`,
                      )
                    ) {
                      e.target.value = account.platform_role ?? "";
                      return;
                    }
                    setPlatformRole.mutate(next, {
                      onError: () => {
                        e.target.value = account.platform_role ?? "";
                      },
                    });
                  }}
                >
                  {roleOptions.map((opt) => (
                    <option key={opt.label} value={opt.value ?? ""}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {roleDropdownDisabled && account.platform_role === "superadmin" ? (
                  <p style={{ color: "var(--console-fg-muted)", fontSize: "0.8125rem", margin: "0.5rem 0 0" }}>
                    Only a super admin can change another super admin&apos;s role.
                  </p>
                ) : null}
                {setPlatformRole.isError ? (
                  <p style={{ color: "var(--console-danger)", fontSize: "0.8125rem", margin: "0.5rem 0 0" }}>
                    {(setPlatformRole.error as Error).message ||
                      "Could not update role. You may be demoting the last super admin."}
                  </p>
                ) : null}
              </div>
            ) : null}

            {canWriteAccount ? (
              <div className={ui.formRow} style={{ marginTop: "1rem" }}>
                <button
                  type="button"
                  className={`${ui.btn} ${ui.btnSecondary}`}
                  onClick={() => patchAccount.mutate(!account.active)}
                >
                  {account.active ? "Suspend account" : "Activate account"}
                </button>
                <button
                  type="button"
                  className={`${ui.btn} ${ui.btnSecondary}`}
                  onClick={() => {
                    const password = window.prompt("New password (min 8 chars):");
                    if (password && password.length >= 8) {
                      resetPassword.mutate(password);
                    }
                  }}
                >
                  Reset password
                </button>
              </div>
            ) : null}
          </section>

          <section className={card.settingCard}>
            <h2>Organization memberships</h2>
            <p style={{ margin: "0 0 1rem", fontSize: "0.8125rem", color: "var(--console-fg-muted)" }}>
              Separate from platform role — a user can be platform staff and org admin in different
              contexts. One platform role per account; one org role per membership.
            </p>
            {account.memberships.length === 0 ? (
              <p style={{ margin: 0, color: "var(--console-fg-muted)", fontSize: "0.875rem" }}>
                No organization memberships.
              </p>
            ) : (
              <div className={ui.tableWrap} style={{ boxShadow: "none" }}>
                <table className={ui.table}>
                  <thead>
                    <tr>
                      <th>Organization</th>
                      <th>Org role</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {account.memberships.map((m) => (
                      <tr key={m.membership_id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{m.org_name}</div>
                          <div style={{ fontSize: "0.8125rem", color: "var(--console-fg-muted)" }}>
                            {m.org_slug}
                          </div>
                        </td>
                        <td>{m.role}</td>
                        <td>{m.status}</td>
                        <td>
                          <button
                            type="button"
                            className={`${ui.btn} ${ui.btnSecondary}`}
                            onClick={() =>
                              router.push(
                                `/organizations?q=${encodeURIComponent(m.org_slug)}`,
                              )
                            }
                          >
                            View org
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </OpsShell>
  );
}
