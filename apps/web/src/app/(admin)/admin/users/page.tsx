import Link from "next/link";

import { AdminDataTable, AdminTableHead, AdminTableRow, AdminTd, AdminTh } from "@/components/admin/admin-data-table";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminReadOnlyBadge } from "@/components/admin/admin-read-only-badge";
import { UserPlatformSuspendControl } from "@/components/admin/user-platform-suspend-control";
import { hasAdminPermission } from "@/lib/admin/roles";
import { requireAdminPermissionSession } from "@/lib/admin/require-admin";
import { prisma } from "@/lib/prisma";

export default async function AdminUsersPage() {
  const { role, userId: actorUserId } = await requireAdminPermissionSession("admin:tenants:read");
  const canSuspend = hasAdminPermission(role, "admin:users:suspend");

  const users = await prisma.user.findMany({
    orderBy: { email: "asc" },
    take: 300,
    select: {
      id: true,
      email: true,
      platformSuspendedAt: true,
      identityLink: {
        select: {
          id: true,
          createdAt: true,
          memberships: {
            select: {
              role: true,
              organization: { select: { slug: true } },
            },
          },
        },
      },
    },
  });

  return (
    <section className="space-y-6">
      <AdminPageHeader
        title="Users"
        subtitle="Accounts and identity links across all organizations."
        actions={!canSuspend ? <AdminReadOnlyBadge /> : null}
      />

      {users.length === 0 ? (
        <AdminEmptyState title="No users" description="User records will appear after sign-in and console provisioning." />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Email</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Created</AdminTh>
              <AdminTh>Identity link</AdminTh>
              <AdminTh>Memberships</AdminTh>
              {canSuspend ? <AdminTh className="text-right">Platform</AdminTh> : null}
            </tr>
          </AdminTableHead>
          <tbody>
            {users.map((user) => (
              <AdminTableRow key={user.id}>
                <AdminTd className="font-medium text-[var(--admin-fg)]">
                  <Link
                    href={`/admin/users/${user.id}`}
                    className="text-[var(--admin-fg)] no-underline hover:underline"
                  >
                    {user.email ?? "unknown"}
                  </Link>
                </AdminTd>
                <AdminTd>
                  {user.platformSuspendedAt ? (
                    <span className="admin-token-badge border-red-300/50 text-red-700">suspended</span>
                  ) : (
                    <span className="admin-token-badge">active</span>
                  )}
                </AdminTd>
                <AdminTd className="text-[var(--admin-fg-subtle)]">
                  {user.identityLink?.createdAt ? user.identityLink.createdAt.toISOString().slice(0, 10) : "—"}
                </AdminTd>
                <AdminTd className="font-mono text-xs text-[var(--admin-fg-muted)]">{user.identityLink?.id ?? "—"}</AdminTd>
                <AdminTd className="text-xs text-[var(--admin-fg-muted)]">
                  {(user.identityLink?.memberships ?? [])
                    .map((m) => `${m.organization.slug} (${m.role})`)
                    .join(", ") || "—"}
                </AdminTd>
                {canSuspend ? (
                  <AdminTd className="text-right">
                    {user.id === actorUserId ? (
                      <span className="text-xs text-[var(--admin-fg-subtle)]">You</span>
                    ) : (
                      <UserPlatformSuspendControl
                        userId={user.id}
                        email={user.email ?? "unknown"}
                        suspended={Boolean(user.platformSuspendedAt)}
                      />
                    )}
                  </AdminTd>
                ) : null}
              </AdminTableRow>
            ))}
          </tbody>
        </AdminDataTable>
      )}
    </section>
  );
}
