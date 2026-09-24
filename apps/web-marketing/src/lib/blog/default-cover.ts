/** Default card + Open Graph image when `coverImageUrl` is empty in frontmatter. */
export const DEFAULT_BLOG_COVER_PATH = "/blog/default-og.png";

export function resolveBlogCoverUrl(coverImageUrl: string | null | undefined): string {
  const raw = coverImageUrl?.trim();
  return raw || DEFAULT_BLOG_COVER_PATH;
}
