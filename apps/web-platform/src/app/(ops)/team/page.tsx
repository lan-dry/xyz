"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield } from "lucide-react";

import { OpsShell } from "@/components/ops-shell";
import card from "@/components/ops-ui/setting-card.module.css";
import { EmptyStatePanel, ErrorAlert, ui } from "@/components/ops-ui/ops-ui";
import { usePlatformSession } from "@/hooks/use-platform-session";
import {
  platformRoleLabel,
  platformRoleOptionsForActor,
  type PlatformRole,
} from "@/lib/platform-permissions";
import { platformApi } from "@/lib/platform-api";

type AccountRow = {
  account_id: string;
  email: string;
  display_name: string | null;
  active: boolean;
  platform_role: PlatformRole | null;
};

export default function PlatformTeamPage() {
  const { email, logout, can, platformRole: actorRole } = usePlatformSession();
  const canWriteRoles = can("platform:roles.write");
  const queryClient = useQueryClient();

  const [grantEmail, setGrantEmail] = useState("");
  const [grantRole, setGrantRole] = useState<PlatformRole>("admin");
  const [grantError, setGrantError] = useState<string | null>(null);
  const [grantOk, setGrantOk] = useState<string | null>(null);

  const staffQuery = useQuery({
    queryKey: ["platform", "team"],
    queryFn: () =>
      platformApi<{ accounts: AccountRow[]; total: number }>(
        "accounts?staff=1&limit=100&offset=0",
      ),
  });

  const setRole = useMutation({
    mutationFn: (input: { accountId: string; platform_role: PlatformRole | null }) =>
      platformApi(`/accounts/${encodeURIComponent(input.accountId)}/platform-role`, {
        method: "PATCH",
        body: JSON.stringify({ platform_role: input.platform_role }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform", "team"] });
      void queryClient.invalidateQueries({ queryKey: ["platform", "users"] });
      void queryClient.invalidateQueries({ queryKey: ["platform", "audit-logs"] });
    },
  });

  const grantAccess = useMutation({
    mutationFn: async () => {
      setGrantError(null);
      setGrantOk(null);
      const q = grantEmail.trim().toLowerCase();
      if (!q) throw new Error("Enter an email address");
      const found = await platformApi<{ accounts: AccountRow[] }>(
        `accounts?q=${encodeURIComponent(q)}&limit=10&offset=0`,
      );
      const exact = found.accounts.find((a) => a.email.toLowerCase() === q);
      if (!exact) {
        throw new Error(
          "No Salanor account with that email. Ask them to sign up on the Console first, then grant Ops access here.",
        );
      }
      await platformApi(`/accounts/${encodeURIComponent(exact.account_id)}/platform-role`, {
        method: "PATCH",
        body: JSON.stringify({ platform_role: grantRole }),
      });
      return exact.email;
    },
    onSuccess: (grantedEmail) => {
      setGrantOk(`Granted ${platformRoleLabel(grantRole)} to ${grantedEmail}.`);
      setGrantEmail("");
      void queryClient.invalidateQueries({ queryKey: ["platform", "team"] });
      void queryClient.invalidateQueries({ queryKey: ["platform", "users"] });
    },
    onError: (err) => {
      setGrantError(err instanceof Error ? err.message : "Could not grant access");
    },
  });

  const staff = staffQuery.data?.accounts ?? [];
  const grantOptions =
    actorRole != null
      ? platformRoleOptionsForActor(actorRole, null).filter((o) => o.value !== null)
      : [];

  return (
    <OpsShell
      title="Platform team"
      subtitle="Salanor employees with Ops access. Separate from customer org Members in the Console."
      staffEmail={email}
      onLogout={logout}
    >
      {canWriteRoles ? (
        <section className={card.settingCard}>
          <h2>Grant Ops access</h2>
          <p>
            Enterprise pattern: the person creates a Salanor account first (Console signup or invite
            to a customer org), then you promote them to platform staff/admin here. Only super admin
            can grant super admin.
          </p>
          <form
            className={ui.formRow}
            style={{ flexWrap: "wrap", alignItems: "flex-end", gap: "0.75rem" }}
            onSubmit={(e) => {
              e.preventDefault();
              grantAccess.mutate();
            }}
          >
            <label className={ui.field} style={{ minWidth: "16rem", flex: "1 1 16rem" }}>
              Work email
              <input
                className={ui.input}
                type="email"
                value={grantEmail}
                onChange={(e) => setGrantEmail(e.target.value)}
                placeholder="teammate@salanor.com"
                required
              />
            </label>
            <label className={ui.field} style={{ minWidth: "12rem" }}>
              Platform role
              <select
                className={ui.select}
                value={grantRole}
                onChange={(e) => setGrantRole(e.target.value as PlatformRole)}
              >
                {grantOptions.map((o) => (
                  <option key={String(o.value)} value={o.value ?? ""}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className={`${ui.btn} ${ui.btnPrimary}`}
              disabled={grantAccess.isPending}
            >
              {grantAccess.isPending ? "Granting…" : "Grant access"}
            </button>
          </form>
          {grantError ? <ErrorAlert message={grantError} /> : null}
          {grantOk ? (
            <p style={{ marginTop: "0.75rem", fontSize: "0.8125rem", color: "var(--console-success)" }}>
              {grantOk}
            </p>
          ) : null}
        </section>
      ) : (
        <section className={card.settingCard}>
          <h2>Platform team</h2>
          <p>Your role is read-only. Ask a platform admin or super admin to grant Ops access.</p>
        </section>
      )}

      <section className={card.settingCard}>
        <h2>Current team ({staffQuery.data?.total ?? staff.length})</h2>
        {staffQuery.isLoading ? (
          <p className={ui.loading}>Loading…</p>
        ) : staff.length === 0 ? (
          <EmptyStatePanel
            icon={Shield}
            title="No platform staff yet"
            description="Grant Ops access to an existing Salanor account above."
          />
        ) : (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Status</th>
                  {canWriteRoles ? <th>Change role</th> : null}
                </tr>
              </thead>
              <tbody>
                {staff.map((a) => {
                  const options = actorRole
                    ? platformRoleOptionsForActor(actorRole, a.platform_role)
                    : [];
                  const disabled =
                    !canWriteRoles ||
                    options.length === 0 ||
                    (a.platform_role === "superadmin" && actorRole !== "superadmin");
                  return (
                    <tr key={a.account_id}>
                      <td>
                        <Link href={`/accounts/${a.account_id}`} className={ui.tableLink}>
                          {a.email}
                        </Link>
                      </td>
                      <td>{a.display_name ?? "-"}</td>
                      <td>{platformRoleLabel(a.platform_role)}</td>
                      <td>{a.active ? "Active" : "Suspended"}</td>
                      {canWriteRoles ? (
                        <td>
                          <select
                            className={ui.select}
                            style={{ minWidth: "11rem" }}
                            value={a.platform_role ?? ""}
                            disabled={disabled || setRole.isPending}
                            onChange={(e) => {
                              const v = e.target.value;
                              const next = v === "" ? null : (v as PlatformRole);
                              if (
                                !window.confirm(
                                  `Set ${a.email} to ${platformRoleLabel(next)}?`,
                                )
                              ) {
                                e.target.value = a.platform_role ?? "";
                                return;
                              }
                              setRole.mutate(
                                { accountId: a.account_id, platform_role: next },
                                {
                                  onError: () => {
                                    e.target.value = a.platform_role ?? "";
                                  },
                                },
                              );
                            }}
                          >
                            {options.map((o) => (
                              <option key={o.label} value={o.value ?? ""}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {setRole.isError ? (
          <ErrorAlert message={(setRole.error as Error).message} />
        ) : null}
      </section>
    </OpsShell>
  );
}
