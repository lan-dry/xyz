import { marked } from "marked";

import { sanitizeBlogHtml } from "@/lib/blog/sanitize";

export function markdownToSafeHtml(markdown: string): string {
  const raw = marked.parse(markdown, { async: false, gfm: true, breaks: false }) as string;
  return sanitizeBlogHtml(raw);
}
