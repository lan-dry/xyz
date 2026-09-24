import Link from "next/link";
import { notFound } from "next/navigation";

import { updateResearchPost } from "@/app/(ops)/content/research/actions";
import { ContentPageShell } from "@/components/content/content-page-shell";
import forms from "@/components/content/content-forms.module.css";
import { ui } from "@/components/ops-ui/ops-ui";
import { getPlatformSessionServer, requirePlatformSession } from "@/lib/platform-server-session";
import { canPlatform } from "@/lib/platform-permissions";
import { prisma } from "@/lib/prisma";

export default async function OpsContentResearchEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformSession("platform:content.read");
  const session = await getPlatformSessionServer();
  const canWrite = session ? canPlatform(session.platform_role, "platform:content.write") : false;

  const { id } = await params;
  const post = await prisma.researchPost.findUnique({ where: { id } });
  if (!post) notFound();

  return (
    <ContentPageShell
      title="Edit research post"
      subtitle={post.slug}
      actions={
        <Link href="/content/research" className={`${ui.btn} ${ui.btnGhost}`}>
          All posts
        </Link>
      }
    >
      {canWrite ? (
        <form action={updateResearchPost.bind(null, post.id)} className={`${ui.card} ${ui.cardPad} ${forms.formCard}`}>
          <input name="title" defaultValue={post.title} className={ui.input} required />
          <input name="slug" defaultValue={post.slug} className={ui.input} required />
          <input name="excerpt" defaultValue={post.dek} className={ui.input} required />
          <input name="track" defaultValue={post.track} className={ui.input} required />
          <textarea name="body" defaultValue={post.body} rows={12} className={ui.textarea} required />
          <div className={forms.formGrid3}>
            <select name="status" defaultValue={post.status} className={ui.select}>
              <option value="draft">draft</option>
              <option value="published">published</option>
            </select>
            <input
              name="publishedAt"
              type="datetime-local"
              defaultValue={post.publishedAt ? post.publishedAt.toISOString().slice(0, 16) : ""}
              className={ui.input}
            />
            <input
              name="readingMinutes"
              type="number"
              min={1}
              defaultValue={post.readingMinutes}
              className={ui.input}
            />
          </div>
          <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`}>
            Save
          </button>
        </form>
      ) : (
        <pre className={`${ui.card} ${ui.cardPad}`} style={{ whiteSpace: "pre-wrap", fontSize: "0.8125rem" }}>
          {post.body}
        </pre>
      )}
    </ContentPageShell>
  );
}
