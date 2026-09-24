import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import matter from "gray-matter";
import { marked } from "marked";

import { sanitizeBlogHtml } from "./sanitize";
import type { BlogPost, BlogPostListItem, BlogPostStatus } from "./types";
import { readingTimeMinutes, slugify } from "./utils";

export type GitBlogFrontmatter = {
  title?: string;
  slug?: string;
  excerpt?: string;
  authorName?: string;
  authorRole?: string | null;
  tags?: string[];
  status?: BlogPostStatus;
  publishedAt?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  coverImageUrl?: string | null;
};

function contentDir(): string {
  const configured = process.env.BLOG_CONTENT_DIR?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
  }
  return path.join(process.cwd(), "content", "blog");
}

function stableId(slug: string): string {
  const hash = createHash("sha256").update(slug).digest("hex").slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function parseFile(filePath: string): BlogPost | null {
  const raw = readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  const fm = data as GitBlogFrontmatter;
  const title = fm.title?.trim();
  if (!title) return null;

  const slug = (fm.slug?.trim() || slugify(title)).toLowerCase();
  const status: BlogPostStatus = fm.status === "published" ? "published" : "draft";
  const html = sanitizeBlogHtml(marked.parse(content, { async: false }) as string);
  const publishedAt =
    status === "published" && fm.publishedAt
      ? new Date(fm.publishedAt).toISOString()
      : status === "published"
        ? new Date().toISOString()
        : null;

  const updatedAt = new Date().toISOString();

  return {
    id: stableId(slug),
    slug,
    title,
    excerpt: fm.excerpt?.trim() ?? "",
    contentHtml: html,
    coverImageUrl: fm.coverImageUrl?.trim() || null,
    authorName: fm.authorName?.trim() || "Salanor",
    authorRole: fm.authorRole?.trim() || null,
    tags: Array.isArray(fm.tags) ? fm.tags.map((t) => String(t).trim()).filter(Boolean) : [],
    status,
    publishedAt,
    createdAt: publishedAt ?? updatedAt,
    updatedAt,
    seoTitle: fm.seoTitle?.trim() || null,
    seoDescription: fm.seoDescription?.trim() || null,
    readingTimeMinutes: readingTimeMinutes(html),
    lastPublishedByEmail: null,
  };
}

export function gitBlogContentEnabled(): boolean {
  if (process.env.BLOG_CONTENT_GIT?.trim() === "0") return false;
  const dir = contentDir();
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((name) => name.endsWith(".md") && name.toLowerCase() !== "readme.md");
}

function loadAllFromGit(): BlogPost[] {
  const dir = contentDir();
  if (!existsSync(dir)) return [];

  const posts: BlogPost[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".md") || name.toLowerCase() === "readme.md") continue;
    const post = parseFile(path.join(dir, name));
    if (post) posts.push(post);
  }

  posts.sort((a, b) => {
    const ta = a.publishedAt ?? a.updatedAt;
    const tb = b.publishedAt ?? b.updatedAt;
    return tb.localeCompare(ta);
  });
  return posts;
}

export function listGitBlogPosts(options?: {
  status?: BlogPostStatus | "all";
  tag?: string;
  includeDrafts?: boolean;
}): BlogPostListItem[] {
  const status = options?.status ?? "published";
  const includeDrafts = options?.includeDrafts ?? false;
  const tag = options?.tag?.trim().toLowerCase();

  return loadAllFromGit()
    .filter((p) => {
      if (tag && !p.tags.some((t) => t.toLowerCase() === tag)) return false;
      if (status === "all") return includeDrafts ? true : p.status === "published";
      return p.status === status;
    })
    .map((p) => {
      const {
        id,
        slug,
        title,
        excerpt,
        coverImageUrl,
        authorName,
        authorRole,
        tags,
        status: st,
        publishedAt,
        createdAt,
        updatedAt,
        readingTimeMinutes: rt,
        lastPublishedByEmail,
      } = p;
      return {
        id,
        slug,
        title,
        excerpt,
        coverImageUrl,
        authorName,
        authorRole,
        tags,
        status: st,
        publishedAt,
        createdAt,
        updatedAt,
        readingTimeMinutes: rt,
        lastPublishedByEmail,
      };
    });
}

export function getGitBlogPostBySlug(slug: string): BlogPost | null {
  return loadAllFromGit().find((p) => p.slug === slug) ?? null;
}

export function getGitBlogPostById(id: string): BlogPost | null {
  return loadAllFromGit().find((p) => p.id === id) ?? null;
}

export function getGitPublishedSlugs(): Array<{ slug: string; updatedAt: string }> {
  return listGitBlogPosts({ status: "published" }).map((p) => ({
    slug: p.slug,
    updatedAt: p.updatedAt,
  }));
}

/** @internal test hook */
export function __parseGitBlogFileForTest(filePath: string): BlogPost | null {
  return parseFile(filePath);
}
