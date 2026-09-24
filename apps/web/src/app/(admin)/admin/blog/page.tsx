import Link from "next/link";

import {
  AdminDataTable,
  AdminTableHead,
  AdminTableRow,
  AdminTd,
  AdminTh,
} from "@/components/admin/admin-data-table";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { adminInkCtaClass } from "@/components/admin/admin-cta";
import { AdminReadOnlyBadge } from "@/components/admin/admin-read-only-badge";
import { canWriteAdminCms } from "@/lib/admin/roles";
import { requireAdminPermissionSession } from "@/lib/admin/require-admin";
import { fetchBlogEngagementStats } from "@/lib/blog/stats";
import { listMarketingBlogPosts } from "@salanor/marketing-blog";

const PUBLIC_BLOG_ORIGIN =
  process.env.NEXT_PUBLIC_MARKETING_URL?.trim() || "https://www.salanor.com";

export default async function AdminBlogPage() {
  const { role } = await requireAdminPermissionSession("admin:cms:read");
  const canWrite = canWriteAdminCms(role);

  const posts = await listMarketingBlogPosts();
  const stats = await fetchBlogEngagementStats(posts.map((p) => p.slug));

  return (
    <section className="space-y-6">
      <AdminPageHeader
        title="Blog"
        subtitle="Markdown in Git — same files as Cursor. Published posts appear on the marketing site after deploy."
        actions={
          <>
            {!canWrite ? <AdminReadOnlyBadge /> : null}
            {canWrite ? (
              <Link
                href="/admin/blog/new"
                className={`inline-flex h-9 items-center px-4 text-sm font-medium no-underline ${adminInkCtaClass}`}
              >
                New post
              </Link>
            ) : null}
          </>
        }
      />

      {posts.length === 0 ? (
        <AdminEmptyState
          title="No blog posts yet"
          description="Create a post here or add a .md file under apps/web-marketing/content/blog."
        />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <AdminTableRow>
              <AdminTh>Title</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Author</AdminTh>
              <AdminTh>Views</AdminTh>
              <AdminTh>Listen</AdminTh>
              <AdminTh>Shares</AdminTh>
              <AdminTh />
            </AdminTableRow>
          </AdminTableHead>
          <tbody>
            {posts.map((post) => {
              const s = stats.get(post.slug);
              return (
                <AdminTableRow key={post.slug}>
                  <AdminTd>
                    <div className="font-medium text-[var(--admin-fg)]">{post.title}</div>
                    <div className="text-xs text-[var(--admin-fg-subtle)]">{post.slug}</div>
                  </AdminTd>
                  <AdminTd>{post.status}</AdminTd>
                  <AdminTd>{post.authorName}</AdminTd>
                  <AdminTd>{s?.views ?? "—"}</AdminTd>
                  <AdminTd>{s?.listenStarts ?? "—"}</AdminTd>
                  <AdminTd>{s?.shareClicks ?? "—"}</AdminTd>
                  <AdminTd>
                    <Link
                      href={`/admin/blog/${encodeURIComponent(post.slug)}`}
                      className="text-sm font-medium text-[var(--admin-accent)] no-underline hover:underline"
                    >
                      Edit
                    </Link>
                    {post.status === "published" ? (
                      <>
                        {" · "}
                        <a
                          href={`${PUBLIC_BLOG_ORIGIN}/blog/${post.slug}`}
                          className="text-sm text-[var(--admin-fg-subtle)]"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View live
                        </a>
                      </>
                    ) : null}
                  </AdminTd>
                </AdminTableRow>
              );
            })}
          </tbody>
        </AdminDataTable>
      )}
    </section>
  );
}
