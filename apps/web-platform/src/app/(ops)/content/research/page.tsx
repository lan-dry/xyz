import Link from "next/link";
import { FileText } from "lucide-react";

import { ContentPageShell } from "@/components/content/content-page-shell";
import { EmptyStatePanel, ui } from "@/components/ops-ui/ops-ui";
import { getPlatformSessionServer, requirePlatformSession } from "@/lib/platform-server-session";
import { canPlatform } from "@/lib/platform-permissions";
import { cmsSetupHint, getCmsDbStatus } from "@/lib/cms-db";
import { getPrisma } from "@/lib/prisma";

export default async function OpsContentResearchPage() {
  await requirePlatformSession("platform:content.read");
  const session = await getPlatformSessionServer();
  const canWrite = session ? canPlatform(session.platform_role, "platform:content.write") : false;

  const db = await getCmsDbStatus();
  const prisma = getPrisma();
  const posts =
    db.research && prisma
      ? await prisma.researchPost.findMany({
          orderBy: { updatedAt: "desc" },
          take: 200,
        })
      : [];

  return (
    <ContentPageShell
      title="Research"
      subtitle="Long-form Markdown (headings, code, images via /blog/media). Published copies render on www/research like blog articles."
      actions={
        db.research && canWrite ? (
          <Link href="/content/research/new" className={`${ui.btn} ${ui.btnPrimary}`}>
            New post
          </Link>
        ) : db.research && !canWrite ? (
          <span className={ui.badgeMuted}>Read-only</span>
        ) : null
      }
    >
      {!db.research ? (
        <EmptyStatePanel title="Research CMS needs database setup" description={cmsSetupHint()} />
      ) : null}

      {db.research && posts.length === 0 ? (
        <EmptyStatePanel
          icon={FileText}
          title="No research posts"
          description={
            canWrite ? "Create your first document with New post." : "No published or draft posts yet."
          }
        />
      ) : db.research ? (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Title</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Published</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id}>
                  <td style={{ fontWeight: 500 }}>{post.title}</td>
                  <td style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{post.slug}</td>
                  <td>{post.status}</td>
                  <td>{post.publishedAt?.toISOString().slice(0, 10) ?? "—"}</td>
                  <td>
                    <Link href={`/content/research/${post.id}`} className={ui.tableLink}>
                      {canWrite ? "Edit" : "View"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </ContentPageShell>
  );
}
