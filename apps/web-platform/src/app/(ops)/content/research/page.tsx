import Link from "next/link";

import { createResearchPost } from "@/app/(ops)/content/research/actions";
import { ContentPageShell } from "@/components/content/content-page-shell";
import forms from "@/components/content/content-forms.module.css";
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
      subtitle="Draft and publish research posts (database CMS on marketing site where enabled)."
    >
      {!db.research ? (
        <EmptyStatePanel
          title="Research CMS needs database setup"
          description={cmsSetupHint()}
        />
      ) : null}
      {db.research && canWrite ? (
        <form action={createResearchPost} className={`${ui.card} ${ui.cardPad} ${forms.formCard}`} style={{ marginBottom: "1.25rem" }}>
          <h3 style={{ margin: 0, fontSize: "0.9375rem", fontWeight: 600 }}>Create post</h3>
          <input name="title" placeholder="Title" className={ui.input} required />
          <input name="slug" placeholder="slug" className={ui.input} required />
          <input name="excerpt" placeholder="Excerpt" className={ui.input} required />
          <textarea name="body" placeholder="Body" rows={6} className={ui.textarea} required />
          <div className={forms.formGrid3}>
            <select name="status" className={ui.select} defaultValue="draft">
              <option value="draft">draft</option>
              <option value="published">published</option>
            </select>
            <input name="publishedAt" type="datetime-local" className={ui.input} />
            <input name="readingMinutes" type="number" defaultValue={5} min={1} className={ui.input} />
          </div>
          <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`}>
            Create
          </button>
        </form>
      ) : (
        <p className={ui.badgeMuted} style={{ marginBottom: "1rem" }}>
          Read-only
        </p>
      )}

      {db.research && posts.length === 0 ? (
        <EmptyStatePanel title="No research posts" description="Create your first post using the form above." />
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
