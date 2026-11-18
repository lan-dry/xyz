"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ConsoleTime } from "@/components/console/console-time";
import {
  ConsolePage,
  EmptyState,
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  StatusBadge,
  ui,
} from "@/components/console/console-ui";
import { consoleApi } from "@/lib/api";
import { formatApprover, formatRoleLabel } from "@/lib/describe-decision";

type Person = { membership_id: string; name: string | null; email: string };

type Delegation = {
  delegate_id: string;
  status: "active" | "expired" | "revoked";
  role_key: string;
  delegate: Person;
  granted_by: Person;
  expires_at: string;
  created_at: string;
  revoked_at: string | null;
  can_revoke: boolean;
};

type DelegationsResponse = {
  me: { membership_id: string; bank_roles: string[]; is_admin: boolean };
  can_grant_roles: Array<{ role_key: string; display_name: string }>;
  can_revoke_others: boolean;
  roles: Array<{ role_key: string; display_name: string }>;
  members: Array<{
    membership_id: string;
    name: string | null;
    email: string;
    console_role: string;
    bank_roles: string[];
  }>;
  delegations: Delegation[];
};

const DURATIONS: Array<{ label: string; minutes: number }> = [
  { label: "1 hour", minutes: 60 },
  { label: "4 hours", minutes: 240 },
  { label: "1 day", minutes: 60 * 24 },
  { label: "3 days", minutes: 60 * 24 * 3 },
  { label: "7 days", minutes: 60 * 24 * 7 },
];

/** Dropdown / table: name first; email stays for title tooltip only. */
function personLabel(
  p: Person,
  bankRole?: string | null,
): string {
  return (
    formatApprover(p.name, bankRole) ??
    p.name?.trim() ??
    formatRoleLabel(bankRole) ??
    p.email
  );
}

export default function DelegationsPage() {
  const queryClient = useQueryClient();
  const [membershipId, setMembershipId] = useState("");
  const [roleKey, setRoleKey] = useState("");
  const [minutes, setMinutes] = useState(DURATIONS[1]!.minutes);
  const [notice, setNotice] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["console", "delegations"],
    refetchInterval: 20_000,
    queryFn: () => consoleApi<DelegationsResponse>("/delegations"),
  });
  const data = query.data;

  const roleName = (key: string) =>
    data?.roles.find((r) => r.role_key === key)?.display_name ?? key;

  const grant = useMutation({
    mutationFn: () =>
      consoleApi("/delegations", {
        method: "POST",
        body: JSON.stringify({
          membership_id: membershipId,
          role_key: roleKey,
          duration_minutes: minutes,
        }),
      }),
    onSuccess: async () => {
      setNotice("Delegation granted. It ends automatically at the time shown.");
      setMembershipId("");
      await queryClient.invalidateQueries({ queryKey: ["console", "delegations"] });
    },
  });

  const revoke = useMutation({
    mutationFn: (delegateId: string) =>
      consoleApi(`/delegations/${encodeURIComponent(delegateId)}`, { method: "DELETE" }),
    onSuccess: async () => {
      setNotice("Delegation ended.");
      await queryClient.invalidateQueries({ queryKey: ["console", "delegations"] });
    },
  });

  const grantable = data?.can_grant_roles ?? [];
  const effectiveRole = roleKey || grantable[0]?.role_key || "";
  const candidates = (data?.members ?? []).filter(
    (m) => m.membership_id !== data?.me.membership_id,
  );
  const canGrant = grantable.length > 0 && candidates.length > 0;

  return (
    <ConsolePage>
      <PageHeader
        title="Delegations"
        subtitle="Cover for a colleague who is away. A delegate can decide cases at the delegated role until the time runs out. Every decision made this way names both people on the receipt."
      />

      {query.isLoading ? <LoadingBlock /> : null}
      {query.error ? <ErrorAlert message={(query.error as Error).message} /> : null}
      {grant.error ? <ErrorAlert message={(grant.error as Error).message} /> : null}
      {revoke.error ? <ErrorAlert message={(revoke.error as Error).message} /> : null}
      {notice ? <div className={`${ui.alert} ${ui.alertSuccess}`}>{notice}</div> : null}

      {data ? (
        <>
          <section className={`${ui.card} ${ui.cardPad}`} aria-labelledby="grant-title">
            <h2 id="grant-title" className={ui.panelTitle}>
              Delegate a role
            </h2>
            {canGrant ? (
              <form
                className={ui.formGridWide}
                onSubmit={(e) => {
                  e.preventDefault();
                  setNotice(null);
                  if (!membershipId || !effectiveRole) return;
                  setRoleKey(effectiveRole);
                  grant.mutate();
                }}
              >
                <label className={ui.field}>
                  <span>Delegate to</span>
                  <select
                    className={ui.select}
                    value={membershipId}
                    onChange={(e) => setMembershipId(e.target.value)}
                    required
                  >
                    <option value="">Choose a colleague</option>
                    {candidates.map((m) => (
                      <option
                        key={m.membership_id}
                        value={m.membership_id}
                        title={m.email}
                      >
                        {personLabel(
                          { membership_id: m.membership_id, name: m.name, email: m.email },
                          m.bank_roles[0] ?? null,
                        )}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={ui.field}>
                  <span>Role to delegate</span>
                  <select
                    className={ui.select}
                    value={effectiveRole}
                    onChange={(e) => setRoleKey(e.target.value)}
                  >
                    {grantable.map((r) => (
                      <option key={r.role_key} value={r.role_key}>
                        {r.display_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={ui.field}>
                  <span>For how long</span>
                  <select
                    className={ui.select}
                    value={minutes}
                    onChange={(e) => setMinutes(Number(e.target.value))}
                  >
                    {DURATIONS.map((d) => (
                      <option key={d.minutes} value={d.minutes}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className={ui.formRow}>
                  <button
                    type="submit"
                    className={`${ui.btn} ${ui.btnPrimary}`}
                    disabled={grant.isPending || !membershipId}
                  >
                    {grant.isPending ? "Granting..." : "Grant delegation"}
                  </button>
                </div>
              </form>
            ) : (
              <p className={ui.cardHint}>
                You can delegate only a role you hold, or a lower one. Your account holds no
                delegable role, or there is no colleague to delegate to yet.
              </p>
            )}
            {data.me.bank_roles.length > 0 ? (
              <p className={ui.cardHint}>
                Your roles: {data.me.bank_roles.map(roleName).join(", ")}
              </p>
            ) : null}
          </section>

          <section aria-labelledby="list-title">
            <h2 id="list-title" className={ui.panelTitle}>
              All delegations
            </h2>
            {data.delegations.length === 0 ? (
              <EmptyState
                title="No delegations yet"
                description="When someone is away, delegate their role here for a fixed time."
              />
            ) : (
              <div className={ui.tableWrap}>
                <table className={ui.table}>
                  <thead>
                    <tr>
                      <th>Delegate</th>
                      <th>Acting for</th>
                      <th>Role</th>
                      <th>Ends</th>
                      <th>Status</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.delegations.map((d) => (
                      <tr key={d.delegate_id}>
                        <td title={d.delegate.email}>{personLabel(d.delegate, d.role_key)}</td>
                        <td title={d.granted_by.email}>{personLabel(d.granted_by)}</td>
                        <td>{roleName(d.role_key)}</td>
                        <td>
                          <ConsoleTime iso={d.revoked_at ?? d.expires_at} />
                        </td>
                        <td>
                          <StatusBadge status={d.status} />
                        </td>
                        <td>
                          {d.can_revoke ? (
                            <button
                              type="button"
                              className={`${ui.btn} ${ui.btnDanger}`}
                              disabled={revoke.isPending}
                              onClick={() => {
                                setNotice(null);
                                revoke.mutate(d.delegate_id);
                              }}
                            >
                              End now
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!data.can_revoke_others ? (
              <p className={ui.cardHint}>
                You can end delegations you granted. A Credit Manager or an administrator can end
                any delegation.
              </p>
            ) : null}
          </section>
        </>
      ) : null}
    </ConsolePage>
  );
}
