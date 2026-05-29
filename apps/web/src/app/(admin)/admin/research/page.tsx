import Link from "next/link";

import { AdminDataTable, AdminTableHead, AdminTableRow, AdminTd, AdminTh } from "@/components/admin/admin-data-table";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { adminInkCtaClass } from "@/components/admin/admin-cta";
import { AdminReadOnlyBadge } from "@/components/admin/admin-read-only-badge";
import { canWriteAdminCms } from "@/lib/admin/roles";
import { requireAdminPermissionSession } from "@/lib/admin/require-admin";
import { prisma } from "@/lib/prisma";

import { createResearchPost } from "./actions";

export default async function AdminResearchPage() {
  const { role } = await requireAdminPermissionSession("admin:cms:read");
  const canWrite = canWriteAdminCms(role);

  const posts = await prisma.researchPost.findMany({
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  return (
    <section className="space-y-6">
      <AdminPageHeader
        title="Research"
        subtitle="Draft and publish research posts for the marketing site."
        actions={!canWrite ? <AdminReadOnlyBadge /> : null}
      />

      {canWrite ? (
      <form action={createResearchPost} className="admin-surface grid gap-3 p-5">
        <h3 className="text-base font-semibold text-[var(--admin-fg)]">Create post</h3>
        <input name="title" placeholder="Title" className="admin-input w-full" required />
        <input name="slug" placeholder="slug" className="admin-input w-full" required />
        <input name="excerpt" placeholder="Excerpt" className="admin-input w-full" required />
        <textarea name="body" placeholder="Body" rows={6} className="admin-textarea w-full resize-y" required />
        <div className="grid gap-3 sm:grid-cols-3">
          <select name="status" className="admin-select w-full">
            <option value="draft">draft</option>
            <option value="published">published</option>
          </select>
          <input name="publishedAt" type="datetime-local" className="admin-input w-full" />
          <input name="readingMinutes" type="number" defaultValue={5} min={1} className="admin-input w-full" />
        </div>
        <button type="submit" className={`inline-flex h-9 w-fit items-center px-4 text-sm font-medium ${adminInkCtaClass}`}>
          Create
        </button>
      </form>
      ) : null}

      {posts.length === 0 ? (
        <AdminEmptyState title="No research posts" description="Create your first post using the form above." />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Title</AdminTh>
              <AdminTh>Slug</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Published</AdminTh>
              <AdminTh className="text-right"> </AdminTh>
            </tr>
          </AdminTableHead>
          <tbody>
            {posts.map((post) => (
              <AdminTableRow key={post.id}>
                <AdminTd className="font-medium text-[var(--admin-fg)]">{post.title}</AdminTd>
                <AdminTd className="font-mono text-xs text-[var(--admin-fg-muted)]">{post.slug}</AdminTd>
                <AdminTd>
                  <span className="admin-token-badge">{post.status}</span>
                </AdminTd>
                <AdminTd className="text-[var(--admin-fg-subtle)]">{post.publishedAt?.toISOString().slice(0, 10) ?? "—"}</AdminTd>
                <AdminTd className="text-right">
                  {canWrite ? (
                    <Link
                      href={`/admin/research/${post.id}`}
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
