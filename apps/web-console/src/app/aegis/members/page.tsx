"use client";

import { Mail, Plus, Users } from "lucide-react";
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
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  const meQuery = useQuery({
    queryKey: ["id", "me"],
    queryFn: () => idApi<MeResponse>("/auth/me"),
  });

  const orgId = meQuery.data?.organization.organization_id;
  const myMembershipId = meQuery.data?.user.user_id;
  const isAdmin = meQuery.data?.user.role === "admin";

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
      idApi<{ invite_url: string }>(`/orgs/${orgId}/invitations`, {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), role }),
      }),
    onSuccess: (data) => {
      setLastInviteUrl(data.invite_url);
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

  const revokeInvite = useMutation({
    mutationFn: (invitationId: string) =>
      idApi<{ ok: boolean }>(`/invitations/${invitationId}`, { method: "DELETE" }),
    onSuccess: () => {
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

  return (
    <ConsolePage>
      {pageHeader}
      {updateRole.isError ? (
        <ErrorAlert message={(updateRole.error as Error).message} />
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

      {lastInviteUrl ? (
        <div className={`${ui.alert} ${ui.alertSuccess}`} style={{ marginBottom: "1.5rem" }}>
          <strong>Invitation sent</strong>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.8125rem" }}>
            Share this link with your teammate:
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
              {lastInviteUrl}
            </pre>
            <CopyButton text={lastInviteUrl} label="Copy link" />
          </div>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            style={{ marginTop: "0.75rem" }}
            onClick={() => setLastInviteUrl(null)}
          >
            Done
          </button>
        </div>
      ) : null}

      <section className={ui.panel}>
        <h2 className={ui.panelTitle}>Active members</h2>
        {membersQuery.isPending ? (
          <LoadingBlock />
        ) : membersQuery.isError ? (
          <ErrorAlert message={(membersQuery.error as Error).message} />
        ) : members.length === 0 ? (
          <EmptyStatePanel
            icon={Users}
            title="You're the first member"
            description="Invite colleagues by email. They'll create an account when they accept — no prior Salanor login required."
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
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.membership_id}>
                    <td>{m.email}</td>
                    <td>{m.display_name ?? "—"}</td>
                    <td>
                      <select
                        className={ui.input}
                        style={{ maxWidth: "10rem", padding: "0.35rem 0.5rem" }}
                        value={m.role}
                        disabled={
                          updateRole.isPending ||
                          m.membership_id === myMembershipId
                        }
                        title={
                          m.membership_id === myMembershipId
                            ? "Ask another admin to change your role"
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
                  </tr>
                ))}
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
                      <button
                        type="button"
                        className={`${ui.btn} ${ui.btnSecondary}`}
                        onClick={() => revokeInvite.mutate(inv.invitation_id)}
                        disabled={revokeInvite.isPending}
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
      </section>

      <Modal
        open={inviteOpen}
        title="Invite member"
        description="They'll receive a link to join your organization. New users can create an account from the invite page."
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
    </ConsolePage>
  );
}
