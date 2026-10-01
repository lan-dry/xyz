import {
  extractBlogMediaPaths,
  listMarketingBlogPosts,
  purgeUnreferencedBlogMedia,
} from "@salanor/marketing-blog";

import { getPrisma } from "@/lib/prisma";

/** Every `/blog/media/…` path still referenced by Git blog, DB research, careers, or legacy DB blog. */
export async function collectReferencedBlogMediaPaths(): Promise<Set<string>> {
  const refs = new Set<string>();

  const add = (...texts: (string | null | undefined)[]) => {
    for (const p of extractBlogMediaPaths(...texts)) refs.add(p);
  };

  const gitPosts = await listMarketingBlogPosts();
  for (const post of gitPosts) {
    add(post.bodyMarkdown, post.coverImageUrl);
  }

  const prisma = getPrisma();
  if (!prisma) return refs;

  const [research, roles, dbBlog] = await Promise.all([
    prisma.researchPost.findMany({
      select: { body: true, heroImageUrl: true, ogImageUrl: true },
    }),
    prisma.openRole.findMany({
      select: { summary: true, requirements: true },
    }),
    prisma.marketingBlogPost.findMany({
      select: { contentHtml: true, coverImageUrl: true },
    }),
  ]);

  for (const row of research) add(row.body, row.heroImageUrl, row.ogImageUrl);
  for (const row of roles) add(row.summary, row.requirements);
  for (const row of dbBlog) add(row.contentHtml, row.coverImageUrl);

  const profilePhotos = await prisma.$queryRaw<{ byline_photo_url: string | null }[]>`
    SELECT byline_photo_url FROM account WHERE byline_photo_url IS NOT NULL
  `;
  for (const row of profilePhotos) add(row.byline_photo_url);

  return refs;
}

/** Delete media files on disk/Git that nothing references anymore. */
export async function gcUnreferencedBlogMedia(editorEmail: string): Promise<string[]> {
  const refs = await collectReferencedBlogMediaPaths();
  const { deleted } = await purgeUnreferencedBlogMedia(refs, editorEmail);
  return deleted;
}
