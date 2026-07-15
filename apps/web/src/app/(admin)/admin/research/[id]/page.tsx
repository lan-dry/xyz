import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { adminInkCtaClass } from "@/components/admin/admin-cta";
import { AdminReadOnlyBadge } from "@/components/admin/admin-read-only-badge";
import { canWriteAdminCms } from "@/lib/admin/roles";
import { requireAdminPermissionSession } from "@/lib/admin/require-admin";
import { prisma } from "@/lib/prisma";

import { updateResearchPost } from "../actions";

export default async function AdminResearchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { role } = await requireAdminPermissionSession("admin:cms:read");
  const canWrite = canWriteAdminCms(role);
  const { id } = await params;
  const post = await prisma.researchPost.findUnique({ where: { id } });
  if (!post) notFound();

  return (
    <section className="space-y-6">
      <AdminPageHeader
        title="Edit research post"
        subtitle={post.slug}
        actions={
          <>
            {!canWrite ? <AdminReadOnlyBadge /> : null}
            <Link
              href="/admin/research"
              className="inline-flex h-9 items-center rounded-lg border border-[var(--admin-border)] px-3 text-sm font-medium text-[var(--admin-fg)] no-underline hover:bg-[var(--admin-surface-hover)]"
            >
              All posts
            </Link>
          </>
        }
      />

      {canWrite ? (
      <form action={updateResearchPost.bind(null, post.id)} className="admin-surface grid gap-3 p-5">
        <input name="title" defaultValue={post.title} className="admin-input w-full" required />
        <input name="slug" defaultValue={post.slug} className="admin-input w-full" required />
        <input name="excerpt" defaultValue={post.dek} className="admin-input w-full" required />
        <input name="track" defaultValue={post.track} className="admin-input w-full" required />
        <textarea name="body" defaultValue={post.body} rows={12} className="admin-textarea w-full resize-y" required />
        <div className="grid gap-3 sm:grid-cols-3">
          <select name="status" defaultValue={post.status} className="admin-select w-full">
            <option value="draft">draft</option>
            <option value="published">published</option>
          </select>
          <input
            name="publishedAt"
            type="datetime-local"
            defaultValue={post.publishedAt ? post.publishedAt.toISOString().slice(0, 16) : ""}
            className="admin-input w-full"
          />
          <input
            name="readingMinutes"
            type="number"
            min={1}
            defaultValue={post.readingMinutes}
            className="admin-input w-full"
          />
        </div>
        <button type="submit" className={`inline-flex h-9 w-fit items-center px-4 text-sm font-medium ${adminInkCtaClass}`}>
          Save
        </button>
      </form>
      ) : (
        <pre className="admin-surface whitespace-pre-wrap p-5 text-sm text-[var(--admin-fg)]">{post.body}</pre>
      )}
    </section>
  );
}
