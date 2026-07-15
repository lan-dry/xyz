import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminDataTable, AdminTableHead, AdminTableRow, AdminTd, AdminTh } from "@/components/admin/admin-data-table";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminReadOnlyBadge } from "@/components/admin/admin-read-only-badge";
import { UserPlatformSuspendControl } from "@/components/admin/user-platform-suspend-control";
import { adminAuditActorEmail, adminUserAuditWhere } from "@/lib/admin/user-audit";
import { hasAdminPermission } from "@/lib/admin/roles";
import { requireAdminPermissionSession } from "@/lib/admin/require-admin";
import { formatDateTime } from "@/lib/format-datetime";
import { prisma } from "@/lib/prisma";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { role, userId: actorUserId } = await requireAdminPermissionSession("admin:tenants:read");
  const canSuspend = hasAdminPermission(role, "admin:users:suspend");
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      platformSuspendedAt: true,
      identityLink: {
        select: {
          createdAt: true,
          memberships: {
            orderBy: { organization: { name: "asc" } },
            select: {
              role: true,
              organization: {
                select: { id: true, name: true, slug: true },
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    notFound();
  }

  const auditEntries = await prisma.consoleAuditLog.findMany({
    where: adminUserAuditWhere(user.id),
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      id: true,
      action: true,
      metadata: true,
      createdAt: true,
    },
  });

  const displayEmail = user.email ?? "unknown";
  const createdAt = user.identityLink?.createdAt;
  const memberships = user.identityLink?.memberships ?? [];
  const isSelf = user.id === actorUserId;

  return (
    <article className="space-y-6">
      <AdminPageHeader
        title={user.name?.trim() || displayEmail}
        subtitle={user.name?.trim() ? displayEmail : "Platform user"}
        actions={
          <>
            {!canSuspend ? <AdminReadOnlyBadge /> : null}
            <Link
              href="/admin/users"
              className="inline-flex h-9 items-center rounded-lg border border-[var(--admin-border)] px-3 text-sm font-medium text-[var(--admin-fg)] no-underline hover:bg-[var(--admin-surface-hover)]"
            >
              All users
            </Link>
          </>
        }
      />

      <dl className="admin-surface grid gap-4 p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--admin-fg-subtle)]">Email</dt>
          <dd className="mt-1">
            <a href={`mailto:${encodeURIComponent(displayEmail)}`} className="text-[var(--admin-fg)]">
              {displayEmail}
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-[var(--admin-fg-subtle)]">User id</dt>
          <dd className="mt-1 font-mono text-xs text-[var(--admin-fg-muted)]">{user.id}</dd>
        </div>
        <div>
          <dt className="text-[var(--admin-fg-subtle)]">Created</dt>
          <dd className="mt-1 text-[var(--admin-fg)]">
            {createdAt ? formatDateTime(createdAt) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--admin-fg-subtle)]">Platform status</dt>
          <dd className="mt-1">
            {user.platformSuspendedAt ? (
              <span className="admin-token-badge border-red-300/50 text-red-700">
                suspended · {formatDateTime(user.platformSuspendedAt)}
              </span>
            ) : (
              <span className="admin-token-badge">active</span>
            )}
          </dd>
        </div>
      </dl>

      {canSuspend && !isSelf ? (
        <section className="admin-surface flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="text-sm font-medium text-[var(--admin-fg)]">Platform access</h2>
            <p className="mt-1 text-sm text-[var(--admin-fg-subtle)]">
              Suspend blocks admin and console sign-in for this account.
            </p>
          </div>
          <UserPlatformSuspendControl
            userId={user.id}
            email={displayEmail}
            suspended={Boolean(user.platformSuspendedAt)}
          />
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-[var(--admin-fg)]">Organization memberships</h2>
        {memberships.length === 0 ? (
          <AdminEmptyState
            title="No memberships"
            description="This user is not a member of any organization yet."
          />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>Organization</AdminTh>
                <AdminTh>Slug</AdminTh>
                <AdminTh>Role</AdminTh>
              </tr>
            </AdminTableHead>
            <tbody>
              {memberships.map((membership) => (
                <AdminTableRow key={`${membership.organization.id}-${membership.role}`}>
                  <AdminTd className="font-medium text-[var(--admin-fg)]">
                    <Link
                      href="/admin/organizations"
                      className="text-[var(--admin-fg)] no-underline hover:underline"
                    >
                      {membership.organization.name}
                    </Link>
                  </AdminTd>
                  <AdminTd className="font-mono text-xs text-[var(--admin-fg-muted)]">
                    {membership.organization.slug}
                  </AdminTd>
                  <AdminTd>
                    <span className="admin-token-badge">{membership.role}</span>
                  </AdminTd>
                </AdminTableRow>
              ))}
            </tbody>
          </AdminDataTable>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-[var(--admin-fg)]">Recent admin audit</h2>
        {auditEntries.length === 0 ? (
          <AdminEmptyState
            title="No audit entries"
            description="Platform suspend and unsuspend actions for this user will appear here."
          />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>Time</AdminTh>
                <AdminTh>Action</AdminTh>
                <AdminTh>Actor</AdminTh>
              </tr>
            </AdminTableHead>
            <tbody>
              {auditEntries.map((entry) => (
                <AdminTableRow key={entry.id}>
                  <AdminTd className="text-[var(--admin-fg-subtle)]">
                    {formatDateTime(entry.createdAt)}
                  </AdminTd>
                  <AdminTd className="font-mono text-xs text-[var(--admin-fg-muted)]">{entry.action}</AdminTd>
                  <AdminTd className="text-[var(--admin-fg-muted)]">
                    {adminAuditActorEmail(entry.metadata) ?? "—"}
                  </AdminTd>
                </AdminTableRow>
              ))}
            </tbody>
          </AdminDataTable>
        )}
      </section>
    </article>
  );
}
