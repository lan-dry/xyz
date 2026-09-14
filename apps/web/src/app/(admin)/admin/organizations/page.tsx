import { AdminDataTable, AdminTableHead, AdminTableRow, AdminTd, AdminTh } from "@/components/admin/admin-data-table";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminReadOnlyBadge } from "@/components/admin/admin-read-only-badge";
import { requireAdminPermissionSession } from "@/lib/admin/require-admin";
import { prisma } from "@/lib/prisma";

export default async function AdminOrganizationsPage() {
  await requireAdminPermissionSession("admin:tenants:read");
  const organizations = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      _count: { select: { memberships: true } },
    },
  });

  return (
    <section className="space-y-6">
      <AdminPageHeader
        title="Organizations"
        subtitle="Tenant records synced from Aegis console provisioning."
        actions={<AdminReadOnlyBadge />}
      />

      {organizations.length === 0 ? (
        <AdminEmptyState title="No organizations" description="Organizations appear here after users create them in the console." />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Name</AdminTh>
              <AdminTh>Slug</AdminTh>
              <AdminTh>Plan</AdminTh>
              <AdminTh>Billing</AdminTh>
              <AdminTh>Members</AdminTh>
              <AdminTh>Created</AdminTh>
            </tr>
          </AdminTableHead>
          <tbody>
            {organizations.map((org) => (
              <AdminTableRow key={org.id}>
                <AdminTd className="font-medium text-[var(--admin-fg)]">{org.name}</AdminTd>
                <AdminTd className="font-mono text-xs text-[var(--admin-fg-muted)]">{org.slug}</AdminTd>
                <AdminTd>
                  <span className="admin-token-badge">{org.plan}</span>
                </AdminTd>
                <AdminTd className="text-[var(--admin-fg-muted)]">{org.billingStatus}</AdminTd>
                <AdminTd className="text-[var(--admin-fg-muted)]">{org._count.memberships}</AdminTd>
                <AdminTd className="text-[var(--admin-fg-subtle)]">{org.createdAt.toISOString().slice(0, 10)}</AdminTd>
              </AdminTableRow>
            ))}
          </tbody>
        </AdminDataTable>
      )}
    </section>
  );
}
