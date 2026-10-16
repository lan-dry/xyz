"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Mail,
  Search,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { AdminEmptyValue } from "@/components/admin-empty-value";
import { EmptyStatePanel } from "@/components/empty-state-panel";
import ui from "@/components/admin-ui.module.css";
import { idApi } from "@/lib/id-api";
import type { MeResponse, OrgInvitation, OrgMember } from "@/lib/id-types";
import { adminCanWrite } from "@/lib/admin-session";
import { ROLE_DESCRIPTIONS, ROLES, roleLabel, type Role } from "@/lib/roles";
import {
  fetchAdminUsers,
  fetchSession,
  type AdminUser,
  type SessionInfo,
} from "@/lib/stoa-client";

const MEMBERS_PAGE_SIZE = 25;

type AccessTab = "members" | "invitations";

function parseAccessTab(raw: string | null): AccessTab {
  if (raw === "invitations") {
    return raw;
  }
  return "members";
}

type InviteLinkResult = {
  invite_url: string;
  email_delivered?: boolean;
  warning?: string;
};

function statusBadgeClass(status: string): string {
  if (status === "active") {
    return `${ui.badge} ${ui.badgeActive}`;
  }
  if (status === "suspended") {
    return `${ui.badge} ${ui.badgeSuspended}`;
  }
  return ui.badge;
}

function Pager(props: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const { page, pageSize, total, onPage } = props;
  if (total === 0) {
    return null;
  }
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className={ui.pager}>
      <span>
        Showing {from} to {to} of {total}
        {totalPages > 1 ? ` · Page ${page} of ${totalPages}` : null}
      </span>
      <div className={ui.pagerActions}>
        <button
          type="button"
          className={`${ui.btn} ${ui.btnSecondary}`}
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft size={16} aria-hidden />
          Previous
        </button>
        <button
          type="button"
          className={`${ui.btn} ${ui.btnSecondary}`}
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Next
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}

export default function AdminAccessPage() {
  return (
    <Suspense fallback={<p className={ui.metaMuted}>Loading access…</p>}>
      <AdminAccessPageContent />
    </Suspense>
  );
}

function AdminAccessPageContent() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const accessTab = parseAccessTab(searchParams.get("tab"));

  function goToTab(tab: AccessTab) {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "members") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }

  useEffect(() => {
    if (searchParams.get("tab") === "sites") {
      router.replace("/admin/sites");
    }
  }, [searchParams, router]);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [lastInvite, setLastInvite] = useState<InviteLinkResult | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{
    membershipId: string;
    email: string;
  } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<OrgInvitation | null>(null);
  const [memberPage, setMemberPage] = useState(1);
  const [memberQ, setMemberQ] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const canWrite = adminCanWrite(session);

  useEffect(() => {
    fetchSession().then(setSession).catch(() => setSession(null));
  }, []);

  const meQuery = useQuery({
    queryKey: ["id", "me"],
    queryFn: () => idApi<MeResponse>("/auth/me"),
  });

  const orgId = meQuery.data?.organization?.organization_id;
  const myEmail = meQuery.data?.account.email?.toLowerCase();

  const membersQuery = useQuery({
    queryKey: [
      "id",
      "members",
      orgId,
      memberPage,
      memberSearch,
      roleFilter,
      statusFilter,
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(memberPage),
        limit: String(MEMBERS_PAGE_SIZE),
      });
      if (memberSearch.trim()) {
        params.set("q", memberSearch.trim());
      }
      if (roleFilter) {
        params.set("role", roleFilter);
      }
      if (statusFilter) {
        params.set("status", statusFilter);
      }
      return idApi<{ members: OrgMember[]; total: number }>(
        `/orgs/${orgId}/members?${params.toString()}`,
      );
    },
    enabled: Boolean(orgId),
  });

  const invitesQuery = useQuery({
    queryKey: ["id", "invitations", orgId],
    queryFn: () =>
      idApi<{ invitations: OrgInvitation[] }>(`/orgs/${orgId}/invitations`),
    enabled: Boolean(orgId),
  });

  const stoaUsersQuery = useQuery({
    queryKey: ["stoa", "admin", "users"],
    queryFn: fetchAdminUsers,
  });

  const stoaByEmail = useMemo(() => {
    const map = new Map<string, AdminUser>();
    for (const u of stoaUsersQuery.data?.users ?? []) {
      map.set(u.externalId.toLowerCase(), u);
    }
    return map;
  }, [stoaUsersQuery.data]);

  const inviteMember = useMutation({
    mutationFn: () =>
      idApi<InviteLinkResult>(`/orgs/${orgId}/invitations`, {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), role }),
      }),
    onSuccess: (data) => {
      setLastInvite(data);
      setEmail("");
      setInviteOpen(false);
      goToTab("invitations");
      void queryClient.invalidateQueries({ queryKey: ["id", "invitations", orgId] });
    },
  });

  const updateRole = useMutation({
    mutationFn: (input: { membershipId: string; role: string }) =>
      idApi(`/orgs/${orgId}/members/${input.membershipId}`, {
        method: "PATCH",
        body: JSON.stringify({ role: input.role }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["id", "members", orgId] });
    },
  });

  const setMemberStatus = useMutation({
    mutationFn: (input: { membershipId: string; status: "active" | "suspended" }) =>
      idApi(`/orgs/${orgId}/members/${input.membershipId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: input.status }),
      }),
    onSuccess: () => {
      setRemoveTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["id", "members", orgId] });
    },
  });

  const revokeInvite = useMutation({
    mutationFn: (invitationId: string) =>
      idApi(`/invitations/${invitationId}`, { method: "DELETE" }),
    onSuccess: () => {
      setRevokeTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["id", "invitations", orgId] });
    },
  });

  const resendInvite = useMutation({
    mutationFn: (invitationId: string) =>
      idApi<InviteLinkResult>(
        `/orgs/${orgId}/invitations/${invitationId}/resend`,
        { method: "POST" },
      ),
    onSuccess: (data) => {
      setLastInvite(data);
      void queryClient.invalidateQueries({ queryKey: ["id", "invitations", orgId] });
    },
  });

  const members = membersQuery.data?.members ?? [];
  const membersTotal = membersQuery.data?.total ?? 0;
  const invitations = invitesQuery.data?.invitations ?? [];
  const stoaSignedIn = stoaUsersQuery.data?.users.length ?? 0;

  function applyMemberSearch() {
    setMemberSearch(memberQ);
    setMemberPage(1);
  }

  function clearMemberFilters() {
    setMemberQ("");
    setMemberSearch("");
    setRoleFilter("");
    setStatusFilter("");
    setMemberPage(1);
  }

  const hasMemberFilters =
    Boolean(memberSearch) || Boolean(roleFilter) || Boolean(statusFilter);

  const mutationError = [
    updateRole.error,
    setMemberStatus.error,
    revokeInvite.error,
    resendInvite.error,
  ].find((e): e is Error => e instanceof Error);

  return (
    <div className={`${ui.page} ${ui.pageWide}`}>
      <header className={ui.pageHeader}>
        <h1 className={ui.pageTitle}>Access</h1>
      </header>

      <div className={ui.statGrid}>
        <div className={ui.card}>
          <p className={ui.cardLabel}>Members</p>
          <p className={ui.cardValue}>{membersTotal}</p>
        </div>
        <div className={ui.card}>
          <p className={ui.cardLabel}>Pending invitations</p>
          <p className={ui.cardValue}>{invitations.length}</p>
        </div>
        <div className={ui.card}>
          <p className={ui.cardLabel}>Have used the workspace</p>
          <p className={ui.cardValue}>{stoaSignedIn}</p>
        </div>
      </div>

      <div className={ui.toolbar} style={{ justifyContent: "space-between" }}>
        <div className={ui.tabBar} style={{ margin: 0, flex: 1 }}>
          {(
            [
              ["members", "Members", membersTotal],
              ["invitations", "Invitations", invitations.length],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              className={accessTab === id ? `${ui.tab} ${ui.tabActive}` : ui.tab}
              onClick={() => goToTab(id)}
            >
              {label}
              <span className={ui.tabCount}>{count}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`${ui.btn} ${ui.btnPrimary}`}
          disabled={!canWrite}
          onClick={() => setInviteOpen(true)}
        >
          Invite member
        </button>
      </div>

      {lastInvite ? (
        <div className={ui.alertSuccess} style={{ marginBottom: "1.25rem" }}>
          <strong>Invitation ready</strong>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.8125rem" }}>
            {lastInvite.warning ??
              "Share this link if the email doesn't arrive."}
          </p>
          <pre className={ui.pre}>{lastInvite.invite_url}</pre>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            style={{ marginTop: "0.5rem" }}
            onClick={() => {
              void navigator.clipboard.writeText(lastInvite.invite_url);
            }}
          >
            Copy link
          </button>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            style={{ marginTop: "0.5rem", marginLeft: "0.5rem" }}
            onClick={() => setLastInvite(null)}
          >
            Done
          </button>
        </div>
      ) : null}

      {mutationError ? (
        <div className={ui.alertError}>{mutationError.message}</div>
      ) : null}

      {accessTab === "members" ? (
        <div className={ui.card}>
          <div className={ui.filterBar}>
            <div className={ui.filterField}>
              <span className={ui.filterLabel}>Search</span>
              <div className={ui.searchWithBtn}>
                <input
                  type="search"
                  className={ui.filterControl}
                  value={memberQ}
                  placeholder="Email or name"
                  onChange={(e) => setMemberQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      applyMemberSearch();
                    }
                  }}
                />
                <button
                  type="button"
                  className={`${ui.btn} ${ui.btnSecondary}`}
                  onClick={applyMemberSearch}
                >
                  <Search size={16} aria-hidden />
                  Search
                </button>
              </div>
            </div>
            <label className={ui.filterField}>
              <span className={ui.filterLabel}>Role</span>
              <select
                className={ui.filterControl}
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setMemberPage(1);
                }}
              >
                <option value="">All roles</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            </label>
            <label className={ui.filterField}>
              <span className={ui.filterLabel}>Status</span>
              <select
                className={ui.filterControl}
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setMemberPage(1);
                }}
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </label>
            {hasMemberFilters ? (
              <div className={ui.filterBarActions}>
                <button
                  type="button"
                  className={`${ui.btn} ${ui.btnSecondary}`}
                  onClick={clearMemberFilters}
                >
                  Clear filters
                </button>
              </div>
            ) : null}
          </div>
          {membersQuery.isPending ? (
            <p className={ui.metaMuted}>Loading members…</p>
          ) : membersQuery.isError ? (
            <div className={ui.alertError}>{membersQuery.error.message}</div>
          ) : membersTotal === 0 && !hasMemberFilters ? (
            <EmptyStatePanel
              icon={Users}
              title="No members yet"
              action={
                canWrite ? (
                  <button
                    type="button"
                    className={`${ui.btn} ${ui.btnPrimary}`}
                    onClick={() => setInviteOpen(true)}
                  >
                    Invite member
                  </button>
                ) : undefined
              }
            />
          ) : members.length === 0 ? (
            <p className={ui.metaMuted}>No matching members.</p>
          ) : (
            <>
              <div className={`${ui.tableWrap} ${ui.tableScroll}`}>
                <table className={ui.table}>
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Site</th>
                      <th>Conversations</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => {
                      const isSelf = m.email.toLowerCase() === myEmail;
                      const isActive = m.status === "active";
                      const stoa = stoaByEmail.get(m.email.toLowerCase());
                      return (
                        <tr key={m.membership_id}>
                          <td>{m.email}</td>
                          <td>
                            {m.display_name ? (
                              m.display_name
                            ) : (
                              <AdminEmptyValue>Not set</AdminEmptyValue>
                            )}
                          </td>
                          <td>
                            <select
                              value={m.role}
                        disabled={
                          !canWrite ||
                          updateRole.isPending ||
                          isSelf ||
                          !isActive
                        }
                              onChange={(e) =>
                                updateRole.mutate({
                                  membershipId: m.membership_id,
                                  role: e.target.value,
                                })
                              }
                            >
                              {ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {roleLabel(r)}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <span className={statusBadgeClass(m.status)}>
                              {m.status}
                            </span>
                          </td>
                          <td>
                            {stoa?.siteName ? (
                              stoa.siteName
                            ) : (
                              <AdminEmptyValue>Unassigned</AdminEmptyValue>
                            )}
                          </td>
                          <td className={ui.metaMuted}>
                            {stoa ? stoa.threadCount : "Never signed in"}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {stoa ? (
                              <Link
                                href={`/admin/people/${stoa.id}`}
                                className={`${ui.btn} ${ui.btnSecondary}`}
                                style={{ marginRight: "0.5rem" }}
                              >
                                Profile
                              </Link>
                            ) : null}
                      {isSelf || !canWrite ? null : isActive ? (
                        <button
                          type="button"
                          className={`${ui.btn} ${ui.btnSecondary}`}
                          onClick={() =>
                            setRemoveTarget({
                                    membershipId: m.membership_id,
                                    email: m.email,
                                  })
                                }
                              >
                                Suspend
                              </button>
                            ) : canWrite ? (
                              <button
                                type="button"
                                className={`${ui.btn} ${ui.btnSecondary}`}
                                onClick={() =>
                                  setMemberStatus.mutate({
                                    membershipId: m.membership_id,
                                    status: "active",
                                  })
                                }
                              >
                                Reactivate
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pager
                page={memberPage}
                pageSize={MEMBERS_PAGE_SIZE}
                total={membersTotal}
                onPage={setMemberPage}
              />
            </>
          )}
        </div>
      ) : null}

      {accessTab === "invitations" ? (
        <div className={ui.card}>
          <p className={ui.listSummary}>Invitations expire after 7 days.</p>
          {invitesQuery.isPending ? (
            <p className={ui.metaMuted}>Loading invitations…</p>
          ) : invitesQuery.isError ? (
            <div className={ui.alertError}>{invitesQuery.error.message}</div>
          ) : invitations.length === 0 ? (
            <EmptyStatePanel
              icon={Mail}
              title="No pending invitations"
              action={
                canWrite ? (
                  <button
                    type="button"
                    className={`${ui.btn} ${ui.btnPrimary}`}
                    onClick={() => setInviteOpen(true)}
                  >
                    <UserPlus size={16} style={{ marginRight: "0.35rem" }} />
                    Invite member
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className={`${ui.tableWrap} ${ui.tableScroll}`}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Expires</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((inv) => (
                    <tr key={inv.invitation_id}>
                      <td>{inv.email}</td>
                      <td>
                        <span className={ui.badge}>{roleLabel(inv.role)}</span>
                      </td>
                      <td className={ui.metaMuted}>
                        {new Date(inv.expires_at).toLocaleString()}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className={`${ui.btn} ${ui.btnSecondary}`}
                          disabled={!canWrite}
                          onClick={() => resendInvite.mutate(inv.invitation_id)}
                        >
                          Resend
                        </button>{" "}
                        <button
                          type="button"
                          className={`${ui.btn} ${ui.btnSecondary}`}
                          disabled={!canWrite}
                          onClick={() => setRevokeTarget(inv)}
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {inviteOpen ? (
        <div className={ui.modalOverlay} role="presentation">
          <div
            className={ui.modal}
            role="dialog"
            aria-labelledby="invite-title"
          >
            <h2 id="invite-title" className={ui.modalTitle}>
              Invite member
            </h2>
            <label className={ui.field}>
              Work email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@company.com"
                autoFocus
              />
            </label>
            <label className={ui.field}>
              Role
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            </label>
            <p className={ui.metaMuted} style={{ marginTop: "-0.25rem" }}>
              {ROLE_DESCRIPTIONS[role]}
            </p>
            {inviteMember.error ? (
              <div className={ui.alertError}>{inviteMember.error.message}</div>
            ) : null}
            <div className={ui.modalActions}>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnSecondary}`}
                onClick={() => setInviteOpen(false)}
                disabled={inviteMember.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnPrimary}`}
                disabled={!email.trim() || inviteMember.isPending}
                onClick={() => inviteMember.mutate()}
              >
                {inviteMember.isPending ? "Sending…" : "Send invitation"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {removeTarget ? (
        <div className={ui.modalOverlay} role="presentation">
          <div className={ui.modal} role="alertdialog">
            <h2 className={ui.modalTitle}>Suspend member</h2>
            <p className={ui.modalDesc}>
              {removeTarget.email} won&apos;t be able to sign in until you
              reactivate them.
            </p>
            <div className={ui.modalActions}>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnSecondary}`}
                onClick={() => setRemoveTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnPrimary}`}
                onClick={() =>
                  setMemberStatus.mutate({
                    membershipId: removeTarget.membershipId,
                    status: "suspended",
                  })
                }
              >
                Suspend
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {revokeTarget ? (
        <div className={ui.modalOverlay} role="presentation">
          <div className={ui.modal} role="alertdialog">
            <h2 className={ui.modalTitle}>Revoke invitation</h2>
            <p className={ui.modalDesc}>
              The link sent to {revokeTarget.email} will stop working.
            </p>
            <div className={ui.modalActions}>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnSecondary}`}
                onClick={() => setRevokeTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnPrimary}`}
                disabled={revokeInvite.isPending}
                onClick={() => revokeInvite.mutate(revokeTarget.invitation_id)}
              >
                Revoke
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
