import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  backfillBlogFromMarkdown,
  blogDatabaseConfigured,
  getStoredBlogPostBySlug,
  listStoredBlogPosts,
  storedPostAsMarkdown,
} from "./db";
import { githubGetTextFile, githubListMarkdownFiles } from "./github";
import { blogContentDir, blogContentRepoPath, localContentAvailable } from "./paths";
import { toSortableIso } from "./dates";
import { parseBlogMarkdown } from "./serialize";
import type { BlogMarkdownPost } from "./types";

function comparePostsNewestFirst(a: BlogMarkdownPost, b: BlogMarkdownPost): number {
  const ta = toSortableIso(a.publishedAt ?? a.lastEditedAt);
  const tb = toSortableIso(b.publishedAt ?? b.lastEditedAt);
  return tb.localeCompare(ta);
}

const CONTENT_REPO_DIR = "apps/web-marketing/content/blog";

function parseLocalFile(filePath: string): BlogMarkdownPost | null {
  const raw = readFileSync(filePath, "utf8");
  const parsed = parseBlogMarkdown(raw, filePath);
  if (!parsed) return null;
  return parsed;
}

function markdownDirs(): string[] {
  const dirs = [blogContentDir(), path.join(process.cwd(), "content", "blog")];
  return [...new Set(dirs)];
}

/** Local Markdown is only a one-time backfill source when the blog table is empty. */
function listLocalPosts(): BlogMarkdownPost[] {
  const posts: BlogMarkdownPost[] = [];
  const seen = new Set<string>();
  for (const dir of markdownDirs()) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".md") || name.toLowerCase() === "readme.md") continue;
      const post = parseLocalFile(path.join(dir, name));
      if (!post || seen.has(post.slug)) continue;
      seen.add(post.slug);
      posts.push(post);
    }
  }

  posts.sort(comparePostsNewestFirst);
  return posts;
}

async function listRemotePosts(): Promise<BlogMarkdownPost[]> {
  const paths = await githubListMarkdownFiles(CONTENT_REPO_DIR);
  const posts: BlogMarkdownPost[] = [];
  for (const repoPath of paths) {
    const file = await githubGetTextFile(repoPath);
    if (!file) continue;
    const parsed = parseBlogMarkdown(file.text, repoPath);
    if (parsed) posts.push(parsed);
  }
  posts.sort(comparePostsNewestFirst);
  return posts;
}

/**
 * Database is the production source.
 * Markdown files and GitHub are a deprecated fallback only when DATABASE_URL is unset
 * (local checkout with no database). They are never preferred over Postgres.
 */
/** Copies legacy Markdown into an empty blog table once per process. Does not read Git after that. */
export async function ensureBlogDatabase(): Promise<void> {
  if (!blogDatabaseConfigured()) return;
  await backfillBlogFromMarkdown(listLocalPosts());
}

export async function listMarketingBlogPosts(): Promise<BlogMarkdownPost[]> {
  if (blogDatabaseConfigured()) {
    await ensureBlogDatabase();
    const rows = await listStoredBlogPosts({ status: "all" });
    return rows.map(storedPostAsMarkdown);
  }
  if (localContentAvailable() || existsSync(path.join(process.cwd(), "content", "blog"))) {
    return listLocalPosts();
  }
  if (!process.env.BLOG_GITHUB_TOKEN?.trim()) return [];
  return listRemotePosts();
}

export async function getMarketingBlogPostBySlug(slug: string): Promise<BlogMarkdownPost | null> {
  const normalized = slug.trim().toLowerCase();
  if (blogDatabaseConfigured()) {
    await ensureBlogDatabase();
    const row = await getStoredBlogPostBySlug(normalized);
    return row ? storedPostAsMarkdown(row) : null;
  }

  for (const dir of markdownDirs()) {
    const filePath = path.join(dir, `${normalized}.md`);
    if (existsSync(filePath)) return parseLocalFile(filePath);
  }

  if (!process.env.BLOG_GITHUB_TOKEN?.trim()) return null;

  const repoPath = blogContentRepoPath(normalized);
  const file = await githubGetTextFile(repoPath);
  if (!file) return null;
  return parseBlogMarkdown(file.text, repoPath);
}
