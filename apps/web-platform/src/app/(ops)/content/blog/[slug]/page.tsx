import Link from "next/link";
import { notFound } from "next/navigation";

import { updateBlogPost } from "@/app/(ops)/content/blog/actions";
import { BlogPostFormFields } from "@/components/content/blog-post-form-fields";
import { ContentPageShell } from "@/components/content/content-page-shell";
import forms from "@/components/content/content-forms.module.css";
import { ui } from "@/components/ops-ui/ops-ui";
import { fetchBlogEngagementStats } from "@/lib/content/blog-stats";
import { getPlatformSessionServer, requirePlatformSession } from "@/lib/platform-server-session";
import { canPlatform } from "@/lib/platform-permissions";
import { getMarketingBlogPostBySlug } from "@salanor/marketing-blog";

const PUBLIC_BLOG_ORIGIN =
  process.env.NEXT_PUBLIC_MARKETING_URL?.trim() || "https://www.salanor.com";

export default async function OpsContentBlogEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  await requirePlatformSession("platform:content.read");
  const session = await getPlatformSessionServer();
  const canWrite = session ? canPlatform(session.platform_role, "platform:content.write") : false;

  const { slug } = await params;
  const sp = await searchParams;
  const post = await getMarketingBlogPostBySlug(slug);
  if (!post) notFound();

  const statsMap = await fetchBlogEngagementStats([post.slug]);
  const stats = statsMap.get(post.slug);

  return (
    <ContentPageShell
      title="Edit blog post"
      subtitle={post.slug}
      actions={
        <>
          <Link href="/content/blog" className={`${ui.btn} ${ui.btnGhost}`}>
            All posts
          </Link>
          {post.status === "published" ? (
            <a
              href={`${PUBLIC_BLOG_ORIGIN}/blog/${post.slug}`}
              className={`${ui.btn} ${ui.btnGhost}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View live
            </a>
          ) : null}
        </>
      }
    >
      {sp.saved === "1" ? (
        <div className={`${ui.alert} ${ui.alertSuccess}`} style={{ marginBottom: "1rem" }}>
          Saved. Push/merge and deploy marketing for www to update.
        </div>
      ) : null}

      <div className={ui.statGrid}>
        <div className={`${ui.card} ${ui.cardPad}`}>
          <p className={ui.cardTitle}>Page views</p>
          <p className={ui.cardValue}>{stats?.views ?? "—"}</p>
        </div>
        <div className={`${ui.card} ${ui.cardPad}`}>
          <p className={ui.cardTitle}>Unique sessions</p>
          <p className={ui.cardValue}>{stats?.uniqueSessions ?? "—"}</p>
        </div>
        <div className={`${ui.card} ${ui.cardPad}`}>
          <p className={ui.cardTitle}>Listen starts</p>
          <p className={ui.cardValue}>{stats?.listenStarts ?? "—"}</p>
        </div>
        <div className={`${ui.card} ${ui.cardPad}`}>
          <p className={ui.cardTitle}>Share clicks</p>
          <p className={ui.cardValue}>{stats?.shareClicks ?? "—"}</p>
        </div>
      </div>

      <div className={`${ui.card} ${ui.cardPad}`} style={{ marginBottom: "1rem", fontSize: "0.8125rem" }}>
        <p>
          <strong>Public byline:</strong> {post.authorName}
          {post.authorRole ? ` · ${post.authorRole}` : ""}
        </p>
        {post.createdByEmail ? <p>Created in ops by {post.createdByEmail}</p> : null}
        {post.lastEditedByEmail ? (
          <p>
            Last edited by {post.lastEditedByEmail}
            {post.lastEditedAt ? ` · ${new Date(post.lastEditedAt).toLocaleString()}` : ""}
          </p>
        ) : null}
      </div>

      {canWrite ? (
        <form action={updateBlogPost.bind(null, post.slug)} className={`${ui.card} ${ui.cardPad} ${forms.formCard}`}>
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
            defaultAuthorEmail={session?.email}
            bodyMarkdown={post.bodyMarkdown}
          />
          <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`}>
            Save
          </button>
          <p style={{ fontSize: "0.75rem", color: "var(--console-fg-muted)" }}>
            Set status to draft to unpublish (hidden on /blog).
          </p>
        </form>
      ) : (
        <pre className={`${ui.card} ${ui.cardPad}`} style={{ whiteSpace: "pre-wrap", fontSize: "0.8125rem" }}>
          {post.bodyMarkdown}
        </pre>
      )}
    </ContentPageShell>
  );
}
