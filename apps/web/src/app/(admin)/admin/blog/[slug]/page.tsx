import Link from "next/link";
import { notFound } from "next/navigation";

import { updateBlogPost } from "@/app/(admin)/admin/blog/actions";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { adminInkCtaClass } from "@/components/admin/admin-cta";
import { AdminReadOnlyBadge } from "@/components/admin/admin-read-only-badge";
import { BlogPostFormFields } from "@/components/admin/blog-post-form-fields";
import { canWriteAdminCms } from "@/lib/admin/roles";
import { requireAdminPermissionSession } from "@/lib/admin/require-admin";
import { fetchBlogEngagementStats } from "@/lib/blog/stats";
import { getMarketingBlogPostBySlug } from "@salanor/marketing-blog";

const PUBLIC_BLOG_ORIGIN =
  process.env.NEXT_PUBLIC_MARKETING_URL?.trim() || "https://www.salanor.com";

export default async function AdminBlogEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { role, email } = await requireAdminPermissionSession("admin:cms:read");
  const canWrite = canWriteAdminCms(role);
  const { slug } = await params;
  const sp = await searchParams;

  const post = await getMarketingBlogPostBySlug(slug);
  if (!post) notFound();

  const statsMap = await fetchBlogEngagementStats([post.slug]);
  const stats = statsMap.get(post.slug);

  return (
    <section className="space-y-6">
      <AdminPageHeader
        title="Edit blog post"
        subtitle={post.slug}
        actions={
          <>
            {!canWrite ? <AdminReadOnlyBadge /> : null}
            <Link
              href="/admin/blog"
              className="inline-flex h-9 items-center rounded-lg border border-[var(--admin-border)] px-3 text-sm font-medium text-[var(--admin-fg)] no-underline hover:bg-[var(--admin-surface-hover)]"
            >
              All posts
            </Link>
            {post.status === "published" ? (
              <a
                href={`${PUBLIC_BLOG_ORIGIN}/blog/${post.slug}`}
                className="inline-flex h-9 items-center rounded-lg border border-[var(--admin-border)] px-3 text-sm font-medium text-[var(--admin-fg)] no-underline hover:bg-[var(--admin-surface-hover)]"
                target="_blank"
                rel="noopener noreferrer"
              >
                View live
              </a>
            ) : null}
          </>
        }
      />

      {sp.saved === "1" ? (
        <p className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-hover)] px-4 py-2 text-sm text-[var(--admin-fg)]">
          Saved. Merge and deploy marketing to update www (same as Cursor edits).
        </p>
      ) : null}

      <div className="admin-surface grid gap-2 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs text-[var(--admin-fg-subtle)]">Page views</p>
          <p className="text-xl font-semibold text-[var(--admin-fg)]">{stats?.views ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--admin-fg-subtle)]">Unique sessions</p>
          <p className="text-xl font-semibold text-[var(--admin-fg)]">{stats?.uniqueSessions ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--admin-fg-subtle)]">Listen starts</p>
          <p className="text-xl font-semibold text-[var(--admin-fg)]">{stats?.listenStarts ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--admin-fg-subtle)]">Share clicks</p>
          <p className="text-xl font-semibold text-[var(--admin-fg)]">{stats?.shareClicks ?? "—"}</p>
        </div>
      </div>

      <div className="admin-surface space-y-1 p-5 text-sm text-[var(--admin-fg-subtle)]">
        <p>
          <span className="font-medium text-[var(--admin-fg)]">Public byline:</span> {post.authorName}
          {post.authorRole ? ` · ${post.authorRole}` : ""}
        </p>
        {post.createdByEmail ? <p>Created in admin by {post.createdByEmail}</p> : null}
        {post.lastEditedByEmail ? (
          <p>
            Last edited by {post.lastEditedByEmail}
            {post.lastEditedAt ? ` · ${new Date(post.lastEditedAt).toLocaleString()}` : ""}
          </p>
        ) : null}
        <p>Full Git history remains on GitHub for every change.</p>
      </div>

      {canWrite ? (
        <form action={updateBlogPost.bind(null, post.slug)} className="admin-surface grid gap-3 p-5">
          <BlogPostFormFields
            defaults={{
              title: post.title,
              slug: post.slug,
              excerpt: post.excerpt,
              authorName: post.authorName,
              authorRole: post.authorRole,
              tags: post.tags,
              status: post.status,
              publishedAt: post.publishedAt,
              seoTitle: post.seoTitle,
              seoDescription: post.seoDescription,
              coverImageUrl: post.coverImageUrl,
            }}
            defaultAuthorEmail={email}
            bodyMarkdown={post.bodyMarkdown}
          />
          <button
            type="submit"
            className={`inline-flex h-9 w-fit items-center px-4 text-sm font-medium ${adminInkCtaClass}`}
          >
            Save
          </button>
          <p className="text-xs text-[var(--admin-fg-subtle)]">
            Set status to <strong>draft</strong> to unpublish (hidden on /blog). Same as editing frontmatter in
            Cursor.
          </p>
        </form>
      ) : (
        <pre className="admin-surface whitespace-pre-wrap p-5 font-mono text-sm text-[var(--admin-fg)]">
          {post.bodyMarkdown}
        </pre>
      )}
    </section>
  );
}
