import Link from "next/link";

import { ContentPageShell } from "@/components/content/content-page-shell";
import { EmptyStatePanel, ui } from "@/components/ops-ui/ops-ui";
import { fetchBlogEngagementStats } from "@/lib/content/blog-stats";
import { getPlatformSessionServer, requirePlatformSession } from "@/lib/platform-server-session";
import { canPlatform } from "@/lib/platform-permissions";
import { listMarketingBlogPosts } from "@salanor/marketing-blog";

const PUBLIC_BLOG_ORIGIN =
  process.env.NEXT_PUBLIC_MARKETING_URL?.trim() || "https://www.salanor.com";

export default async function OpsContentBlogPage() {
  await requirePlatformSession("platform:content.read");
  const session = await getPlatformSessionServer();
  const canWrite = session ? canPlatform(session.platform_role, "platform:content.write") : false;

  const posts = await listMarketingBlogPosts();
  const stats = await fetchBlogEngagementStats(posts.map((p) => p.slug));

  return (
    <ContentPageShell
      title="Blog"
      subtitle="Markdown in Git — same files as Cursor. Live on www after merge and marketing deploy."
      actions={
        canWrite ? (
          <Link href="/content/blog/new" className={`${ui.btn} ${ui.btnPrimary}`}>
            New post
          </Link>
        ) : (
          <span className={ui.badgeMuted}>Read-only</span>
        )
      }
    >
      {posts.length === 0 ? (
        <EmptyStatePanel
          title="No blog posts yet"
          description="Create a post or add a .md file under apps/web-marketing/content/blog."
        />
      ) : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Author</th>
                <th>Views</th>
                <th>Listen</th>
                <th>Shares</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => {
                const s = stats.get(post.slug);
                return (
                  <tr key={post.slug}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{post.title}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--console-fg-muted)" }}>{post.slug}</div>
                    </td>
                    <td>{post.status}</td>
                    <td>{post.authorName}</td>
                    <td>{s?.views ?? "—"}</td>
                    <td>{s?.listenStarts ?? "—"}</td>
                    <td>{s?.shareClicks ?? "—"}</td>
                    <td>
                      <Link href={`/content/blog/${encodeURIComponent(post.slug)}`} className={ui.tableLink}>
                        Edit
                      </Link>
                      {post.status === "published" ? (
                        <>
                          {" · "}
                          <a
                            href={`${PUBLIC_BLOG_ORIGIN}/blog/${post.slug}`}
                            className={ui.tableLink}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Live
                          </a>
                        </>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ContentPageShell>
  );
}
