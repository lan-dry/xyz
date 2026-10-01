import Link from "next/link";
import { notFound } from "next/navigation";

import { ContentPageShell } from "@/components/content/content-page-shell";
import { ResearchEditForm } from "@/components/content/research-edit-form";
import { ui } from "@/components/ops-ui/ops-ui";
import { markdownToSafeHtml } from "@/lib/cms-markdown-preview";
import { getPlatformSessionServer, requirePlatformSession } from "@/lib/platform-server-session";
import { canPlatform } from "@/lib/platform-permissions";
import {
  getResearchBylineForAccount,
  resolveResearchBylineDisplay,
} from "@/lib/research-author";
import { getPrisma } from "@/lib/prisma";

export default async function OpsContentResearchEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; created?: string }>;
}) {
  await requirePlatformSession("platform:content.read");
  const session = await getPlatformSessionServer();
  const canWrite = session ? canPlatform(session.platform_role, "platform:content.write") : false;

  const { id } = await params;
  const query = await searchParams;
  const prisma = getPrisma();
  const post = prisma ? await prisma.researchPost.findUnique({ where: { id } }) : null;
  if (!post) notFound();

  const stored =
    prisma && session ? await getResearchBylineForAccount(prisma, session.account_id) : null;
  const byline = session ? resolveResearchBylineDisplay(session, stored) : null;

  const flash =
    query.saved === "1" ? "Saved." : query.created === "1" ? "Created." : null;

  return (
    <ContentPageShell
      title="Edit research post"
      subtitle={post.slug}
      actions={
        <>
          <Link href="/content/research" className={`${ui.btn} ${ui.btnGhost}`}>
            All posts
          </Link>
          {post.status === "published" ? (
            <a
              href={`${process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://www.salanor.com"}/research/${post.slug}`}
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
      {flash ? (
        <p className={ui.badgeMuted} style={{ marginBottom: "1rem" }}>
          {flash}
        </p>
      ) : null}
      {canWrite ? (
        <ResearchEditForm
          researchId={post.id}
          defaults={{
            title: post.title,
            slug: post.slug,
            excerpt: post.dek,
            track: post.track,
            status: post.status,
            publishedAt: post.publishedAt,
            readingMinutes: post.readingMinutes,
            heroImageUrl: post.heroImageUrl,
            ogImageUrl: post.ogImageUrl,
            body: post.body,
          }}
          byline={
            byline
              ? { name: byline.name, role: byline.role }
              : { name: "—", role: "—" }
          }
        />
      ) : (
        <div className={`${ui.card} ${ui.cardPad}`}>
          <div dangerouslySetInnerHTML={{ __html: markdownToSafeHtml(post.body) }} />
        </div>
      )}
    </ContentPageShell>
  );
}
