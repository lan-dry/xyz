import Link from "next/link";
import { notFound } from "next/navigation";

import { updateBlogPost } from "@/app/(ops)/content/blog/actions";
import { BlogPostFormFields } from "@/components/content/blog-post-form-fields";
import { ContentPageShell } from "@/components/content/content-page-shell";
import forms from "@/components/content/content-forms.module.css";
import { ui } from "@/components/ops-ui/ops-ui";
import { fetchBlogEngagementByCountry, fetchBlogEngagementStats } from "@/lib/content/blog-stats";
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
  const viewsByCountry = await fetchBlogEngagementByCountry(post.slug);

  return (
    <ContentPageShell
      title="Edit blog post"
      subtitle={post.slug}
      actions={
        <>
          <Link href="/content/blog" className={`${ui.btn} ${ui.btnGhost}`}>
            All posts
          </Link>
          <a
            href={`/content/blog/${encodeURIComponent(post.slug)}/export`}
            className={`${ui.btn} ${ui.btnGhost}`}
          >
            Export Markdown
          </a>
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
          Saved to the database. The public site reads this record. A scheduled date stays off the site until that time.
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

      {viewsByCountry.length > 0 ? (
        <div className={`${ui.card} ${ui.cardPad}`} style={{ marginBottom: "1rem" }}>
          <p className={ui.cardTitle}>Page views by country</p>
          <p style={{ fontSize: "0.75rem", color: "var(--console-fg-muted)", marginBottom: "0.75rem" }}>
            From edge headers on www (Vercel/Cloudflare). Local dev often shows Unknown until deployed.
          </p>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Country</th>
                <th>Views</th>
              </tr>
            </thead>
            <tbody>
              {viewsByCountry.map((row) => (
                <tr key={row.country}>
                  <td>{row.label}</td>
                  <td>{row.views}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className={forms.hint} style={{ marginBottom: "1rem" }}>
        The public article uses{" "}
        <Link href="/content/authors" className={ui.tableLink}>
          My public profile
        </Link>
        {post.lastEditedByEmail
          ? `. Last edited by ${post.lastEditedByEmail}${post.lastEditedAt ? ` · ${new Date(post.lastEditedAt).toLocaleString()}` : ""}.`
          : "."}
      </p>

      {canWrite ? (
        <form action={updateBlogPost.bind(null, post.slug)} className={`${ui.card} ${ui.cardPad} ${forms.formCard}`}>
          <BlogPostFormFields
            defaults={{
              title: post.title,
              slug: post.slug,
              excerpt: post.excerpt,
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
            Draft stays hidden. Published with a future date is scheduled and appears on the public site at that time. Set status to draft to unpublish.
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
