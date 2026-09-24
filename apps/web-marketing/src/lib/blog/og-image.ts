import { DEFAULT_BLOG_COVER_PATH } from "@/lib/blog/default-cover";
import { SITE_ORIGIN } from "@/lib/site-origin";

export function absoluteBlogOgImage(coverImageUrl: string | null | undefined): string {
  const raw = coverImageUrl?.trim();
  if (!raw) return `${SITE_ORIGIN}${DEFAULT_BLOG_COVER_PATH}`;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("/")) return `${SITE_ORIGIN}${raw}`;
  return `${SITE_ORIGIN}/${raw.replace(/^\//, "")}`;
}
