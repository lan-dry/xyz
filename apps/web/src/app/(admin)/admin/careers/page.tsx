import Link from "next/link";

import { AdminDataTable, AdminTableHead, AdminTableRow, AdminTd, AdminTh } from "@/components/admin/admin-data-table";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { adminInkCtaClass } from "@/components/admin/admin-cta";
import { AdminReadOnlyBadge } from "@/components/admin/admin-read-only-badge";
import { canWriteAdminCms } from "@/lib/admin/roles";
import { requireAdminPermissionSession } from "@/lib/admin/require-admin";
import { prisma } from "@/lib/prisma";

import { createRole } from "./actions";

export default async function AdminCareersPage() {
  const { role } = await requireAdminPermissionSession("admin:cms:read");
  const canWrite = canWriteAdminCms(role);

  const roles = await prisma.openRole.findMany({
    orderBy: { postedAt: "desc" },
    take: 200,
  });

  return (
    <section className="space-y-6">
      <AdminPageHeader
        title="Careers"
        subtitle="Manage open roles shown on the careers page."
        actions={!canWrite ? <AdminReadOnlyBadge /> : null}
      />

      {canWrite ? (
      <form action={createRole} className="admin-surface grid gap-3 p-5">
        <h3 className="text-base font-semibold text-[var(--admin-fg)]">Create role</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <input name="title" placeholder="Title" className="admin-input w-full" required />
          <input name="slug" placeholder="slug" className="admin-input w-full" required />
          <input name="team" placeholder="Team" className="admin-input w-full" required />
          <input name="location" placeholder="Location" className="admin-input w-full" required />
          <input name="seniority" placeholder="Seniority" className="admin-input w-full" required />
          <select name="employmentType" className="admin-select w-full">
            <option value="full_time">full_time</option>
            <option value="part_time">part_time</option>
            <option value="contract">contract</option>
          </select>
        </div>
        <textarea name="summary" placeholder="Summary" rows={5} className="admin-textarea w-full resize-y" required />
        <textarea name="requirements" placeholder="Requirements" rows={5} className="admin-textarea w-full resize-y" required />
        <div className="grid gap-3 sm:grid-cols-3">
          <input name="compensationRange" placeholder="Compensation" className="admin-input w-full" />
          <select name="status" className="admin-select w-full">
            <option value="open">open</option>
            <option value="closed">closed</option>
            <option value="draft">draft</option>
          </select>
          <input name="postedAt" type="datetime-local" className="admin-input w-full" />
        </div>
        <button type="submit" className={`inline-flex h-9 w-fit items-center px-4 text-sm font-medium ${adminInkCtaClass}`}>
          Create
        </button>
      </form>
      ) : null}

      {roles.length === 0 ? (
        <AdminEmptyState title="No open roles" description="Create your first role using the form above." />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Title</AdminTh>
              <AdminTh>Slug</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Posted</AdminTh>
              <AdminTh className="text-right"> </AdminTh>
            </tr>
          </AdminTableHead>
          <tbody>
            {roles.map((role) => (
              <AdminTableRow key={role.id}>
                <AdminTd className="font-medium text-[var(--admin-fg)]">{role.title}</AdminTd>
                <AdminTd className="font-mono text-xs text-[var(--admin-fg-muted)]">{role.slug}</AdminTd>
                <AdminTd>
                  <span className="admin-token-badge">{role.status}</span>
                </AdminTd>
                <AdminTd className="text-[var(--admin-fg-subtle)]">{role.postedAt.toISOString().slice(0, 10)}</AdminTd>
                <AdminTd className="text-right">
                  {canWrite ? (
                    <Link
                      href={`/admin/careers/${role.id}`}
                      className="inline-flex h-8 items-center rounded-lg border border-[var(--admin-border)] px-3 text-sm font-medium text-[var(--admin-fg)] no-underline hover:bg-[var(--admin-surface-hover)]"
                    >
                      Edit
                    </Link>
                  ) : (
                    <span className="text-xs text-[var(--admin-fg-subtle)]">View only</span>
                  )}
                </AdminTd>
              </AdminTableRow>
            ))}
          </tbody>
        </AdminDataTable>
      )}
    </section>
  );
}
