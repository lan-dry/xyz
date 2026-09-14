import type { BlogPost } from "./types";

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

export function readingTimeMinutes(html: string): number {
  const text = html.replace(/<[^>]+>/g, " ");
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

export function formatBlogDate(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export type TocItem = { id: string; text: string; level: 2 | 3 };

export function extractTableOfContents(html: string): TocItem[] {
  const items: TocItem[] = [];
  const re = /<h([23])[^>]*(?:id="([^"]*)")?[^>]*>(.*?)<\/h\1>/gi;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = re.exec(html)) !== null) {
    const level = Number(match[1]) as 2 | 3;
    const text = match[3].replace(/<[^>]+>/g, "").trim();
    if (!text) continue;
    const id = match[2]?.trim() || `${slugify(text)}-${index}`;
    items.push({ id, text, level });
    index += 1;
  }
  return items;
}

export function injectHeadingIds(html: string): string {
  let index = 0;
  return html.replace(/<h([23])([^>]*)>(.*?)<\/h\1>/gi, (_full, level, attrs, inner) => {
    const text = String(inner).replace(/<[^>]+>/g, "").trim();
    const hasId = /id\s*=/.test(String(attrs));
    if (hasId || !text) {
      return `<h${level}${attrs}>${inner}</h${level}>`;
    }
    const id = `${slugify(text)}-${index}`;
    index += 1;
    return `<h${level}${attrs} id="${id}">${inner}</h${level}>`;
  });
}

export function uniqueTags(posts: Pick<BlogPost, "tags">[]): string[] {
  const set = new Set<string>();
  for (const post of posts) {
    for (const tag of post.tags) {
      const t = tag.trim();
      if (t) set.add(t);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
