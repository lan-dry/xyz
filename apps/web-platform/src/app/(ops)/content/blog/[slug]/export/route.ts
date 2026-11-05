import { NextResponse } from "next/server";

import { getPlatformSessionServer } from "@/lib/platform-server-session";
import { canPlatform } from "@/lib/platform-permissions";
import { getMarketingBlogPostBySlug, serializeBlogMarkdown } from "@salanor/marketing-blog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Download the database post as Markdown. Git is not updated. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await getPlatformSessionServer();
  if (!session || !canPlatform(session.platform_role, "platform:content.read")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const post = await getMarketingBlogPostBySlug(slug);
  if (!post) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const markdown = serializeBlogMarkdown(
    {
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      bodyMarkdown: post.bodyMarkdown,
      authorName: post.authorName,
      authorRole: post.authorRole,
      tags: post.tags,
      status: post.status,
      publishedAt: post.publishedAt,
      seoTitle: post.seoTitle,
      seoDescription: post.seoDescription,
      coverImageUrl: post.coverImageUrl,
    },
    {
      editorEmail: session.email,
      editorAccountId: post.authorAccountId ?? session.account_id,
      isCreate: false,
      previousCreatedByEmail: post.createdByEmail,
      priorAuthorAccountId: post.authorAccountId,
      priorAuthorEmail: post.authorEmail,
    },
  );

  return new NextResponse(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${post.slug}.md"`,
    },
  });
}
