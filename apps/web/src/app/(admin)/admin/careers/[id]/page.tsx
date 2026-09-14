import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { adminInkCtaClass } from "@/components/admin/admin-cta";
import { AdminReadOnlyBadge } from "@/components/admin/admin-read-only-badge";
import { canWriteAdminCms } from "@/lib/admin/roles";
import { requireAdminPermissionSession } from "@/lib/admin/require-admin";
import { prisma } from "@/lib/prisma";

import { updateRole } from "../actions";

export default async function AdminCareerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { role: adminRole } = await requireAdminPermissionSession("admin:cms:read");
  const canWrite = canWriteAdminCms(adminRole);
  const { id } = await params;
  const role = await prisma.openRole.findUnique({ where: { id } });
  if (!role) notFound();

  return (
    <section className="space-y-6">
      <AdminPageHeader
        title="Edit role"
        subtitle={role.slug}
        actions={
          <>
            {!canWrite ? <AdminReadOnlyBadge /> : null}
            <Link
              href="/admin/careers"
              className="inline-flex h-9 items-center rounded-lg border border-[var(--admin-border)] px-3 text-sm font-medium text-[var(--admin-fg)] no-underline hover:bg-[var(--admin-surface-hover)]"
            >
              All roles
            </Link>
          </>
        }
      />

      {canWrite ? (
      <form action={updateRole.bind(null, role.id)} className="admin-surface grid gap-3 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <input name="title" defaultValue={role.title} className="admin-input w-full" required />
          <input name="slug" defaultValue={role.slug} className="admin-input w-full" required />
          <input name="team" defaultValue={role.team} className="admin-input w-full" required />
          <input name="location" defaultValue={role.location} className="admin-input w-full" required />
          <input name="seniority" defaultValue={role.seniority} className="admin-input w-full" required />
          <select name="employmentType" defaultValue={role.employmentType} className="admin-select w-full">
            <option value="full_time">full_time</option>
            <option value="part_time">part_time</option>
            <option value="contract">contract</option>
          </select>
        </div>
        <textarea name="summary" defaultValue={role.summary} rows={6} className="admin-textarea w-full resize-y" required />
        <textarea
          name="requirements"
          defaultValue={role.requirements}
          rows={6}
          className="admin-textarea w-full resize-y"
          required
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            name="compensationRange"
            defaultValue={role.compensationRange ?? ""}
            className="admin-input w-full"
          />
          <select name="status" defaultValue={role.status} className="admin-select w-full">
            <option value="open">open</option>
            <option value="closed">closed</option>
            <option value="draft">draft</option>
          </select>
          <input
            name="postedAt"
            type="datetime-local"
            defaultValue={role.postedAt.toISOString().slice(0, 16)}
            className="admin-input w-full"
          />
        </div>
        <input
          name="closesAt"
          type="datetime-local"
          defaultValue={role.closesAt ? role.closesAt.toISOString().slice(0, 16) : ""}
          className="admin-input w-full"
        />
        <button type="submit" className={`inline-flex h-9 w-fit items-center px-4 text-sm font-medium ${adminInkCtaClass}`}>
          Save
        </button>
      </form>
      ) : (
        <pre className="admin-surface whitespace-pre-wrap p-5 text-sm text-[var(--admin-fg)]">{role.summary}</pre>
      )}
    </section>
  );
}
