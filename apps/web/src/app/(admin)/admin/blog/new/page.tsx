import Link from "next/link";

import { createBlogPost } from "@/app/(admin)/admin/blog/actions";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { adminInkCtaClass } from "@/components/admin/admin-cta";
import { BlogPostFormFields } from "@/components/admin/blog-post-form-fields";
import { requireAdminPermissionSession } from "@/lib/admin/require-admin";
import { redirect } from "next/navigation";
import { canWriteAdminCms } from "@/lib/admin/roles";

export default async function AdminBlogNewPage() {
  const { role, email } = await requireAdminPermissionSession("admin:cms:read");
  if (!canWriteAdminCms(role)) {
    redirect("/admin/blog");
  }

  return (
    <section className="space-y-6">
      <AdminPageHeader
        title="New blog post"
        subtitle="Saves the same Markdown file as editing in Cursor."
        actions={
          <Link
            href="/admin/blog"
            className="inline-flex h-9 items-center rounded-lg border border-[var(--admin-border)] px-3 text-sm font-medium text-[var(--admin-fg)] no-underline hover:bg-[var(--admin-surface-hover)]"
          >
            All posts
          </Link>
        }
      />

      <form action={createBlogPost} className="admin-surface grid gap-3 p-5">
        <BlogPostFormFields
          defaultAuthorName=""
          defaultAuthorEmail={email}
          bodyMarkdown=""
        />
        <button
          type="submit"
          className={`inline-flex h-9 w-fit items-center px-4 text-sm font-medium ${adminInkCtaClass}`}
        >
          Create draft
        </button>
      </form>
    </section>
  );
}
