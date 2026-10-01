"use server";

import { deleteMarketingBlogMedia, extractBlogMediaPaths } from "@salanor/marketing-blog";

import { assertPlatformSessionAction } from "@/lib/platform-server-session";
import { collectReferencedBlogMediaPaths } from "@/lib/cms-media-gc";
import { getPrisma } from "@/lib/prisma";

function isBlogMediaPath(publicPath: string): boolean {
  return /^\/blog\/media\/[A-Za-z0-9._-]+$/.test(publicPath.trim());
}

async function referencedPathsWithCmsExclude(options: {
  excludeResearchId?: string;
  excludeOpenRoleId?: string;
}): Promise<Set<string>> {
  const refs = await collectReferencedBlogMediaPaths();
  const prisma = getPrisma();
  if (!prisma) return refs;

  if (options.excludeResearchId?.trim()) {
    const post = await prisma.researchPost.findUnique({
      where: { id: options.excludeResearchId.trim() },
      select: { body: true, heroImageUrl: true, ogImageUrl: true },
    });
    if (post) {
      for (const p of extractBlogMediaPaths(post.body, post.heroImageUrl, post.ogImageUrl)) {
        refs.delete(p);
      }
    }
  }

  if (options.excludeOpenRoleId?.trim()) {
    const role = await prisma.openRole.findUnique({
      where: { id: options.excludeOpenRoleId.trim() },
      select: { summary: true, requirements: true },
    });
    if (role) {
      for (const p of extractBlogMediaPaths(role.summary, role.requirements)) {
        refs.delete(p);
      }
    }
  }

  return refs;
}

/** Delete a media file immediately if nothing references it (optional: ignore one CMS row while editing). */
export async function removeBlogMediaNow(
  publicPath: string,
  options?: { excludeResearchId?: string; excludeOpenRoleId?: string },
): Promise<void> {
  const session = await assertPlatformSessionAction("platform:content.write");
  const path = publicPath.trim();
  if (!isBlogMediaPath(path)) {
    throw new Error("Only /blog/media/ paths can be removed here");
  }

  const refs =
    options?.excludeResearchId?.trim() || options?.excludeOpenRoleId?.trim()
      ? await referencedPathsWithCmsExclude(options ?? {})
      : await collectReferencedBlogMediaPaths();

  if (refs.has(path)) {
    throw new Error("This file is still referenced in another post or page");
  }

  await deleteMarketingBlogMedia(path, session.email);
}
