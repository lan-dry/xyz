import { AdminDataTable, AdminTableHead, AdminTableRow, AdminTd, AdminTh } from "@/components/admin/admin-data-table";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { requireAdminPermissionSession } from "@/lib/admin/require-admin";
import { prisma } from "@/lib/prisma";

export default async function AdminInternalUsersPage() {
  await requireAdminPermissionSession("admin:internal-users:manage");

  const internalUsers = await prisma.salInternalUser.findMany({
    orderBy: { email: "asc" },
    take: 200,
  });

  return (
    <section className="space-y-6">
      <AdminPageHeader
        title="Internal users"
        subtitle="Salanor staff with admin access. Add rows via seed script or SQL — UI CRUD is not shipped yet."
      />

      {internalUsers.length === 0 ? (
        <AdminEmptyState
          title="No internal users"
          description='Run `pnpm db:seed:superadmin` or insert into sal_internal_users with role superadmin, eng, or support.'
        />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Email</AdminTh>
              <AdminTh>Role</AdminTh>
              <AdminTh>Added</AdminTh>
            </tr>
          </AdminTableHead>
          <tbody>
            {internalUsers.map((row) => (
              <AdminTableRow key={row.id}>
                <AdminTd className="font-medium text-[var(--admin-fg)]">{row.email}</AdminTd>
                <AdminTd>
                  <span className="admin-token-badge">{row.role}</span>
                </AdminTd>
                <AdminTd className="text-[var(--admin-fg-subtle)]">{row.createdAt.toISOString().slice(0, 10)}</AdminTd>
              </AdminTableRow>
            ))}
          </tbody>
        </AdminDataTable>
      )}
    </section>
  );
}
