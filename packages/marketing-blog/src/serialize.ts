import matter from "gray-matter";

import { toSortableIso } from "./dates";
import type {
  BlogEditorContext,
  BlogMarkdownFrontmatter,
  BlogMarkdownPost,
  BlogPostSaveInput,
} from "./types";

function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags?.length) return [];
  return tags.map((t) => t.trim()).filter(Boolean);
}

function normalizePublishedAt(status: BlogPostSaveInput["status"], publishedAt: string | null | undefined): string | null {
  if (status !== "published") return null;
  if (publishedAt?.trim()) {
    const d = new Date(publishedAt);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

export function buildFrontmatter(
  input: BlogPostSaveInput,
  ctx: BlogEditorContext,
): BlogMarkdownFrontmatter {
  const now = new Date().toISOString();
  return {
    title: input.title.trim(),
    slug: input.slug.trim().toLowerCase(),
    excerpt: input.excerpt.trim(),
    authorName: input.authorName.trim(),
    authorRole: input.authorRole?.trim() || null,
    tags: normalizeTags(input.tags),
    status: input.status === "published" ? "published" : "draft",
    publishedAt: normalizePublishedAt(input.status, input.publishedAt),
    seoTitle: input.seoTitle?.trim() || null,
    seoDescription: input.seoDescription?.trim() || null,
    coverImageUrl: input.coverImageUrl?.trim() || null,
    authorAccountId: ctx.isCreate
      ? ctx.editorAccountId?.trim() || null
      : ctx.priorAuthorAccountId?.trim() || ctx.editorAccountId?.trim() || null,
    authorEmail: ctx.isCreate
      ? ctx.editorEmail.trim().toLowerCase()
      : (ctx.priorAuthorEmail?.trim().toLowerCase() ||
          ctx.editorEmail.trim().toLowerCase()),
    createdByEmail: ctx.isCreate ? ctx.editorEmail : ctx.previousCreatedByEmail ?? ctx.editorEmail,
    lastEditedByEmail: ctx.editorEmail,
    lastEditedAt: now,
  };
}

export function serializeBlogMarkdown(input: BlogPostSaveInput, ctx: BlogEditorContext): string {
  const fm = buildFrontmatter(input, ctx);
  const body = input.bodyMarkdown.replace(/\r\n/g, "\n").trimEnd();
  return matter.stringify(body ? `${body}\n` : "", fm);
}

export function parseBlogMarkdown(raw: string, filePath: string): BlogMarkdownPost | null {
  const { data, content } = matter(raw);
  const fm = data as Partial<BlogMarkdownFrontmatter>;
  const title = fm.title?.trim();
  if (!title) return null;

  const slug = (fm.slug?.trim() || title).toLowerCase();
  const status = fm.status === "published" ? "published" : "draft";

  return {
    title,
    slug,
    excerpt: fm.excerpt?.trim() ?? "",
    authorName: fm.authorName?.trim() || "Salanor",
    authorRole: fm.authorRole?.trim() || null,
    tags: Array.isArray(fm.tags) ? fm.tags.map((t) => String(t).trim()).filter(Boolean) : [],
    status,
    publishedAt: toSortableIso(fm.publishedAt) || null,
    seoTitle: fm.seoTitle?.trim() || null,
    seoDescription: fm.seoDescription?.trim() || null,
    coverImageUrl: fm.coverImageUrl?.trim() || null,
    authorAccountId: fm.authorAccountId?.trim() || null,
    authorEmail:
      fm.authorEmail?.trim().toLowerCase() ||
      fm.createdByEmail?.trim().toLowerCase() ||
      null,
    createdByEmail: fm.createdByEmail?.trim() || null,
    lastEditedByEmail: fm.lastEditedByEmail?.trim() || null,
    lastEditedAt: toSortableIso(fm.lastEditedAt) || null,
    bodyMarkdown: content.replace(/^\n/, "").replace(/\n$/, ""),
    filePath,
  } satisfies BlogMarkdownPost;
}
