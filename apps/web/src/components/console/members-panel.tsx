"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/console/button";
import { ConsoleEmptyState } from "@/components/console/console-empty-state";
import { formatDateTime } from "@/lib/format-datetime";

type MemberRow = {
  id: string;
  identityLinkId: string;
  email: string;
  role: string;
  createdAt: string;
};

type InviteRow = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
  invitedByEmail: string;
};

const INVITE_ROLES = ["admin", "developer", "compliance", "viewer"] as const;
type InviteRole = (typeof INVITE_ROLES)[number];
const MEMBER_ROLES = ["viewer", "compliance", "developer", "admin", "owner"] as const;
type MemberRole = (typeof MEMBER_ROLES)[number];

function isMemberRole(value: string): value is MemberRole {
  return (MEMBER_ROLES as readonly string[]).includes(value);
}

function canAssignRole(actorRole: string, targetRole: string, nextRole: MemberRole): boolean {
  if (actorRole === "owner") {
    return true;
  }
  if (actorRole === "admin") {
    if (targetRole === "owner") return false;
    return nextRole !== "owner";
  }
  return false;
}

export function MembersPanel({
  members,
  invites,
  canManageInvites,
  actorRole,
  actorIdentityLinkId,
  ownerCount,
}: {
  members: MemberRow[];
  invites: InviteRow[];
  canManageInvites: boolean;
  actorRole: string;
  actorIdentityLinkId: string;
  ownerCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [memberRows, setMemberRows] = useState(members);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("developer");
  const [inviteRows, setInviteRows] = useState(invites);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberSuccess, setMemberSuccess] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-base font-semibold text-ink">Members</h3>
        {memberRows.length === 0 ? (
          <div className="mt-3">
            <ConsoleEmptyState
              title="No members yet"
              description="Invite teammates to collaborate in this organization."
            />
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs font-medium tracking-tight text-gray-500">
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {memberRows.map((member) => {
                const isSelf = member.identityLinkId === actorIdentityLinkId;
                const canManageMember = canManageInvites && !isSelf;
                const canRemove =
                  canManageMember &&
                  (member.role !== "owner" || (actorRole === "owner" && ownerCount > 1));
                const disableOwnerDemotion = member.role === "owner" && ownerCount <= 1;
                return (
                <tr key={member.id} className="border-t border-gray-100 transition-colors duration-150 hover:bg-gray-50/70">
                  <td className="px-4 py-3">{member.email}</td>
                  <td className="px-4 py-3">
                    {canManageMember ? (
                      <select
                        value={member.role}
                        className="console-select h-8 px-2"
                        disabled={pending}
                        onChange={(e) => {
                          const nextRole = e.target.value as MemberRole;
                          if (!canAssignRole(actorRole, member.role, nextRole)) {
                            setMemberError("You do not have permission to assign that role.");
                            return;
                          }
                          if (disableOwnerDemotion && nextRole !== "owner") {
                            setMemberError("Cannot demote the last owner.");
                            return;
                          }
                          setMemberError(null);
                          setMemberSuccess(null);
                          startTransition(async () => {
                            const res = await fetch(`/api/console/memberships/${member.id}/role`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ role: nextRole }),
                            });
                            const payload = (await res.json().catch(() => ({}))) as { error?: string; role?: string };
                            const nextMemberRole = payload.role;
                            if (!res.ok || typeof nextMemberRole !== "string" || !isMemberRole(nextMemberRole)) {
                              setMemberError(payload.error ?? "Unable to change role.");
                              return;
                            }
                            setMemberRows((prev) =>
                              prev.map((row) =>
                                row.id === member.id
                                  ? {
                                      ...row,
                                      role: nextMemberRole,
                                    }
                                  : row,
                              ),
                            );
                            setMemberSuccess(`Updated ${member.email} to ${nextMemberRole}.`);
                            router.refresh();
                          });
                        }}
                      >
                        {MEMBER_ROLES.map((roleOption) => (
                          <option
                            key={roleOption}
                            value={roleOption}
                            disabled={!canAssignRole(actorRole, member.role, roleOption)}
                          >
                            {roleOption}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span>
                        {member.role}
                        {isSelf ? " (you)" : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDateTime(member.createdAt)}</td>
                  <td className="px-4 py-3">
                    {canRemove ? (
                      <button
                        type="button"
                        disabled={pending}
                        className="text-sm text-red-800 transition-colors duration-150 hover:text-red-900 disabled:opacity-60"
                        onClick={() => {
                          setMemberError(null);
                          setMemberSuccess(null);
                          startTransition(async () => {
                            const res = await fetch(`/api/console/memberships/${member.id}`, {
                              method: "DELETE",
                            });
                            const payload = (await res.json().catch(() => ({}))) as { error?: string };
                            if (!res.ok) {
                              setMemberError(payload.error ?? "Unable to remove member.");
                              return;
                            }
                            setMemberRows((prev) => prev.filter((row) => row.id !== member.id));
                            setMemberSuccess(`Removed ${member.email}.`);
                            router.refresh();
                          });
                        }}
                      >
                        Remove
                      </button>
                    ) : (
                      <span className="text-ink/50">{isSelf ? "Self" : "—"}</span>
                    )}
                  </td>
                </tr>
                );
              })
              }
            </tbody>
          </table>
          </div>
        )}
        {memberError ? <p className="mt-3 text-sm text-red-700">{memberError}</p> : null}
        {memberSuccess ? <p className="mt-3 text-sm text-emerald-700">{memberSuccess}</p> : null}
      </section>

      <section>
        <h3 className="text-base font-semibold text-ink">Pending invites</h3>

        {canManageInvites ? (
          <form
            className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              setSuccess(null);
              startTransition(async () => {
                const res = await fetch("/api/console/invites", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email, role }),
                });
                const payload = (await res.json().catch(() => ({}))) as {
                  error?: string;
                  invite?: {
                    id: string;
                    email: string;
                    role: string;
                    expiresAt: string;
                    createdAt: string;
                    invitedBy: { primaryEmail: string };
                  };
                };
                const invite = payload.invite;
                if (
                  !res.ok ||
                  !invite ||
                  typeof invite.id !== "string" ||
                  typeof invite.email !== "string" ||
                  typeof invite.role !== "string" ||
                  typeof invite.expiresAt !== "string" ||
                  typeof invite.createdAt !== "string" ||
                  typeof invite.invitedBy?.primaryEmail !== "string"
                ) {
                  setError(payload.error ?? "Unable to send invite.");
                  return;
                }
                const inviteRow: InviteRow = {
                  id: invite.id,
                  email: invite.email,
                  role: invite.role,
                  expiresAt: invite.expiresAt,
                  createdAt: invite.createdAt,
                  invitedByEmail: invite.invitedBy.primaryEmail,
                };
                setInviteRows((prev) => [
                  inviteRow,
                  ...prev.filter((row) => row.email.toLowerCase() !== invite.email.toLowerCase()),
                ]);
                setSuccess(`Invite sent to ${invite.email}.`);
                setEmail("");
                router.refresh();
              });
            }}
          >
            <label className="block text-sm">
              <span className="text-gray-600">Email</span>
              <input
                type="email"
                className="console-input mt-1 block w-72"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@company.com"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Role</span>
              <select
                className="console-select mt-1 block"
                value={role}
                onChange={(e) => setRole(e.target.value as InviteRole)}
              >
                {INVITE_ROLES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={pending}>
              Send invite
            </Button>
          </form>
        ) : (
          <p className="mt-2 text-sm text-ink/70">Your role cannot manage invites (requires admin or owner).</p>
        )}

        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}

        {inviteRows.length === 0 ? (
          <div className="mt-3">
            <ConsoleEmptyState
              title="No invites yet"
              description="Invite a teammate to grant console access."
            />
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs font-medium tracking-tight text-gray-500">
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Invited by</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                {canManageInvites ? <th className="px-4 py-3 font-medium">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {inviteRows.map((invite) => (
                <tr key={invite.id} className="border-t border-gray-100 transition-colors duration-150 hover:bg-gray-50/70">
                  <td className="px-4 py-3">{invite.email}</td>
                  <td className="px-4 py-3">{invite.role}</td>
                  <td className="px-4 py-3 text-gray-500">{invite.invitedByEmail}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDateTime(invite.expiresAt)}</td>
                  {canManageInvites ? (
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        className="text-sm text-red-800 transition-colors duration-150 hover:text-red-900"
                        disabled={pending}
                        onClick={() => {
                          setError(null);
                          setSuccess(null);
                          startTransition(async () => {
                            const res = await fetch(`/api/console/invites/${invite.id}/revoke`, {
                              method: "POST",
                            });
                            if (!res.ok) {
                              setError("Unable to revoke invite.");
                              return;
                            }
                            setInviteRows((prev) => prev.filter((row) => row.id !== invite.id));
                            router.refresh();
                          });
                        }}
                      >
                        Revoke
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
              }
            </tbody>
          </table>
          </div>
        )}
      </section>
    </div>
  );
}
