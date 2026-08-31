"use client";

import { Mail, Plus, Users } from "lucide-react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { EmptyStatePanel } from "@/components/console/empty-state-panel";
import { Modal } from "@/components/console/modal";
import { CopyButton } from "@/components/console/copy-button";
import {
  ConsolePage,
  ConsolePagination,
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  StatusBadge,
  ui,
} from "@/components/console/console-ui";
import { idApi } from "@/lib/id-api";
import type { MeResponse, OrgInvitation, OrgMember } from "@/lib/types";

const ROLES = ["admin", "engineer", "auditor", "viewer"] as const;
const MEMBER_PAGE_SIZES = [25, 50, 100] as const;

type InviteLinkResult = {
  invite_url: string;
  email_delivered?: boolean;
  warning?: string;
  email?: string;
};

export default function MembersPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const page = useMemo(() => {
    const raw = Number(searchParams.get("page") ?? "1");
    return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
  }, [searchParams]);
  const limit = useMemo(() => {
    const raw = Number(searchParams.get("limit") ?? "25");
    return MEMBER_PAGE_SIZES.includes(raw as (typeof MEMBER_PAGE_SIZES)[number])
      ? (raw as (typeof MEMBER_PAGE_SIZES)[number])
      : 25;
  }, [searchParams]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("engineer");
  const [lastInvite, setLastInvite] = useState<InviteLinkResult | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{
    membershipId: string;
    email: string;
  } | null>(null);

  const meQuery = useQuery({
    queryKey: ["id", "me"],
    queryFn: () => idApi<MeResponse>("/auth/me"),
  });

  const orgId = meQuery.data?.organization?.organization_id;
  const myMembershipId = meQuery.data?.user?.user_id;
  const isAdmin = meQuery.data?.user?.role === "admin";

  const membersQuery = useQuery({
    queryKey: ["id", "members", orgId, page, limit],
    queryFn: () =>
      idApi<{ members: OrgMember[]; total: number; page: number; limit: number }>(
        `/orgs/${orgId}/members?page=${page}&limit=${limit}`,
      ),
    enabled: Boolean(orgId && isAdmin),
  });

  const invitesQuery = useQuery({
    queryKey: ["id", "invitations", orgId],
    queryFn: () =>
      idApi<{ invitations: OrgInvitation[] }>(`/orgs/${orgId}/invitations`),
    enabled: Boolean(orgId && isAdmin),
  });

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
      void queryClient.invalidateQueries({ queryKey: ["id", "invitations", orgId] });
    },
  });

  const updateRole = useMutation({
    mutationFn: (input: { membershipId: string; role: string }) =>
      idApi<{ member: OrgMember }>(
        `/orgs/${orgId}/members/${input.membershipId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ role: input.role }),
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["id", "members", orgId] });
    },
  });

  const setMemberStatus = useMutation({
    mutationFn: (input: { membershipId: string; status: "active" | "suspended" }) =>
      idApi<{ member: OrgMember }>(
        `/orgs/${orgId}/members/${input.membershipId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: input.status }),
        },
      ),
    onSuccess: () => {
      setRemoveTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["id", "members", orgId] });
    },
  });

  const revokeInvite = useMutation({
    mutationFn: (invitationId: string) =>
      idApi<{ ok: boolean }>(`/invitations/${invitationId}`, { method: "DELETE" }),
    onSuccess: () => {
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

  const pageHeader = (
    <PageHeader
      title="Members"
      subtitle="Invite teammates and manage organization access."
    />
  );

  if (meQuery.isPending) {
    return (
      <ConsolePage>
        {pageHeader}
        <LoadingBlock />
      </ConsolePage>
    );
  }

  if (!isAdmin) {
    return (
      <ConsolePage>
        {pageHeader}
        <EmptyStatePanel
          icon={Users}
          title="Admin access required"
          description="Contact an admin in your organization to invite teammates or change roles."
        />
      </ConsolePage>
    );
  }

  const members = membersQuery.data?.members ?? [];
  const membersTotal = membersQuery.data?.total ?? 0;
  const invitations = invitesQuery.data?.invitations ?? [];

  function setMembersPage(nextPage: number) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("page", String(nextPage));
    router.replace(`${pathname}?${next.toString()}`);
  }

  function setMembersLimit(nextLimit: number) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("limit", String(nextLimit));
    next.delete("page");
    router.replace(`${pathname}?${next.toString()}`);
  }

  const inviteBannerOk = lastInvite?.email_delivered !== false;

  return (
    <ConsolePage>
      {pageHeader}
      {updateRole.isError ? (
        <ErrorAlert message={(updateRole.error as Error).message} />
      ) : null}
      {setMemberStatus.isError ? (
        <ErrorAlert message={(setMemberStatus.error as Error).message} />
      ) : null}
      {resendInvite.isError ? (
        <ErrorAlert message={(resendInvite.error as Error).message} />
      ) : null}
      <div className={ui.toolbar} style={{ justifyContent: "flex-end", marginTop: 0 }}>
        <button
          type="button"
          className={`${ui.btn} ${ui.btnPrimary}`}
          onClick={() => setInviteOpen(true)}
        >
          <Plus size={16} aria-hidden />
          Invite member
        </button>
      </div>

      {lastInvite ? (
        <div
          className={`${ui.alert} ${inviteBannerOk ? ui.alertSuccess : ui.alertInfo}`}
          style={{ marginBottom: "1.5rem" }}
        >
          <strong>
            {inviteBannerOk
              ? "Invitation ready"
              : "Invitation created. Email not delivered"}
          </strong>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.8125rem" }}>
            {lastInvite.warning ??
              "Email sent. If they don’t see it, check spam or copy this link and share it directly:"}
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.5rem",
              alignItems: "flex-start",
              marginTop: "0.5rem",
            }}
          >
            <pre className={ui.pre} style={{ flex: 1, margin: 0 }}>
              {lastInvite.invite_url}
            </pre>
            <CopyButton text={lastInvite.invite_url} label="Copy link" />
          </div>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            style={{ marginTop: "0.75rem" }}
            onClick={() => setLastInvite(null)}
          >
            Done
          </button>
        </div>
      ) : null}

      <section className={ui.panel}>
        <h2 className={ui.panelTitle}>Members</h2>
        <p className={ui.muted} style={{ marginTop: 0, marginBottom: "1rem" }}>
          Removing someone suspends console access for this org; their Salanor account remains and
          they can create a new organization or accept another invite. Suspensions are logged in{" "}
          <Link href="/aegis/logs?action=membership.suspended" className={ui.tableLink}>
            Logs
          </Link>
          .
        </p>
        {membersQuery.isPending ? (
          <LoadingBlock />
        ) : membersQuery.isError ? (
          <ErrorAlert message={(membersQuery.error as Error).message} />
        ) : members.length === 0 ? (
          <EmptyStatePanel
            icon={Users}
            title="You're the first member"
            description="Invite colleagues by email. They'll create an account when they accept: no prior Salanor login required."
            action={
              <button
                type="button"
                className={`${ui.btn} ${ui.btnPrimary}`}
                onClick={() => setInviteOpen(true)}
              >
                <Plus size={16} aria-hidden />
                Invite member
              </button>
            }
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
                  <th>Joined</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const isSelf = m.membership_id === myMembershipId;
                  const isActive = m.status === "active";
                  return (
                  <tr key={m.membership_id}>
                    <td>{m.email}</td>
                    <td>{m.display_name ?? "-"}</td>
                    <td>
                      <select
                        className={ui.input}
                        style={{ maxWidth: "10rem", padding: "0.35rem 0.5rem" }}
                        value={m.role}
                        disabled={
                          updateRole.isPending ||
                          isSelf ||
                          !isActive
                        }
                        title={
                          isSelf
                            ? "Ask another admin to change your role"
                            : !isActive
                              ? "Reactivate this member to change their role"
                              : undefined
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
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <StatusBadge status={m.status} />
                    </td>
                    <td className={ui.muted}>
                      {new Date(m.joined_at).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {isSelf ? null : isActive ? (
                        <button
                          type="button"
                          className={`${ui.btn} ${ui.btnSecondary}`}
                          disabled={setMemberStatus.isPending}
                          onClick={() =>
                            setRemoveTarget({
                              membershipId: m.membership_id,
                              email: m.email,
                            })
                          }
                        >
                          Remove
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={`${ui.btn} ${ui.btnSecondary}`}
                          disabled={setMemberStatus.isPending}
                          onClick={() =>
                            setMemberStatus.mutate({
                              membershipId: m.membership_id,
                              status: "active",
                            })
                          }
                        >
                          {setMemberStatus.isPending &&
                          setMemberStatus.variables?.membershipId === m.membership_id
                            ? "Reactivating…"
                            : "Reactivate"}
                        </button>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            <ConsolePagination
              total={membersTotal}
              limit={limit}
              page={page}
              onPageChange={setMembersPage}
              onLimitChange={setMembersLimit}
              noun="member"
              pageSizes={MEMBER_PAGE_SIZES}
            />
          </div>
        )}
      </section>

      <section className={ui.panel}>
        <h2 className={ui.panelTitle}>Pending invitations</h2>
        <p className={ui.muted} style={{ marginTop: 0, marginBottom: "1rem" }}>
          If someone didn’t get the email, use Resend (new email + fresh link) or
          copy the link and share it in Slack / chat.
        </p>
        {invitesQuery.isPending ? (
          <LoadingBlock />
        ) : invitesQuery.isError ? (
          <ErrorAlert message={(invitesQuery.error as Error).message} />
        ) : invitations.length === 0 ? (
          <EmptyStatePanel
            icon={Mail}
            title="No pending invitations"
            description="Invitations expire after 7 days. Send one to onboard someone who doesn't have a Salanor account yet."
            action={
              <button
                type="button"
                className={`${ui.btn} ${ui.btnPrimary}`}
                onClick={() => setInviteOpen(true)}
              >
                <Plus size={16} aria-hidden />
                Invite member
              </button>
            }
          />
        ) : (
          <div className={ui.tableWrap}>
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
                      <StatusBadge status={inv.role} />
                    </td>
                    <td className={ui.muted}>
                      {new Date(inv.expires_at).toLocaleString()}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div
                        style={{
                          display: "inline-flex",
                          flexWrap: "wrap",
                          gap: "0.5rem",
                          justifyContent: "flex-end",
                        }}
                      >
                        <button
                          type="button"
                          className={`${ui.btn} ${ui.btnSecondary}`}
                          onClick={() => resendInvite.mutate(inv.invitation_id)}
                          disabled={
                            resendInvite.isPending || revokeInvite.isPending
                          }
                        >
                          {resendInvite.isPending &&
                          resendInvite.variables === inv.invitation_id
                            ? "Sending…"
                            : "Resend"}
                        </button>
                        <button
                          type="button"
                          className={`${ui.btn} ${ui.btnSecondary}`}
                          onClick={() => revokeInvite.mutate(inv.invitation_id)}
                          disabled={
                            revokeInvite.isPending || resendInvite.isPending
                          }
                        >
                          Revoke
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        open={inviteOpen}
        title="Invite member"
        description="They'll receive a link to join your organization. New users can create an account from the invite page. You can always resend or copy the link from Pending invitations."
        closeOnOverlayClick={false}
        onClose={() => {
          if (!inviteMember.isPending) setInviteOpen(false);
        }}
        footer={
          <>
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
          </>
        }
      >
        <label className={ui.field}>
          Work email
          <input
            className={ui.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@company.com"
            required
            autoFocus
          />
        </label>
        <label className={ui.field} style={{ marginTop: "1rem" }}>
          Role
          <select
            className={ui.input}
            value={role}
            onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        {inviteMember.isError ? (
          <ErrorAlert message={(inviteMember.error as Error).message} />
        ) : null}
      </Modal>

      <Modal
        open={Boolean(removeTarget)}
        title="Remove member"
        description={
          removeTarget
            ? `Remove ${removeTarget.email} from this organization? They will lose console access immediately. Their account is not deleted. You can reactivate them later.`
            : undefined
        }
        closeOnOverlayClick={false}
        onClose={() => {
          if (!setMemberStatus.isPending) setRemoveTarget(null);
        }}
        footer={
          <>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              onClick={() => setRemoveTarget(null)}
              disabled={setMemberStatus.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              disabled={!removeTarget || setMemberStatus.isPending}
              onClick={() => {
                if (!removeTarget) return;
                setMemberStatus.mutate({
                  membershipId: removeTarget.membershipId,
                  status: "suspended",
                });
              }}
            >
              {setMemberStatus.isPending ? "Removing…" : "Remove from organization"}
            </button>
          </>
        }
      >
        {null}
      </Modal>
    </ConsolePage>
  );
}
