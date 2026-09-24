import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { githubGetTextFile, githubListMarkdownFiles } from "./github";
import { blogContentDir, blogContentRepoPath, localContentAvailable } from "./paths";
import { parseBlogMarkdown } from "./serialize";
import type { BlogMarkdownPost } from "./types";

const CONTENT_REPO_DIR = "apps/web-marketing/content/blog";

function parseLocalFile(filePath: string): BlogMarkdownPost | null {
  const raw = readFileSync(filePath, "utf8");
  const parsed = parseBlogMarkdown(raw, filePath);
  if (!parsed) return null;
  return parsed;
}

function listLocalPosts(): BlogMarkdownPost[] {
  const dir = blogContentDir();
  if (!existsSync(dir)) return [];

  const posts: BlogMarkdownPost[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".md") || name.toLowerCase() === "readme.md") continue;
    const post = parseLocalFile(path.join(dir, name));
    if (post) posts.push(post);
  }

  posts.sort((a, b) => {
    const ta = a.publishedAt ?? a.lastEditedAt ?? "";
    const tb = b.publishedAt ?? b.lastEditedAt ?? "";
    return tb.localeCompare(ta);
  });
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
  posts.sort((a, b) => {
    const ta = a.publishedAt ?? a.lastEditedAt ?? "";
    const tb = b.publishedAt ?? b.lastEditedAt ?? "";
    return tb.localeCompare(ta);
  });
  return posts;
}

export async function listMarketingBlogPosts(): Promise<BlogMarkdownPost[]> {
  if (localContentAvailable()) return listLocalPosts();
  if (!process.env.BLOG_GITHUB_TOKEN?.trim()) return [];
  return listRemotePosts();
}

export async function getMarketingBlogPostBySlug(slug: string): Promise<BlogMarkdownPost | null> {
  const normalized = slug.trim().toLowerCase();
  if (localContentAvailable()) {
    const filePath = path.join(blogContentDir(), `${normalized}.md`);
    if (!existsSync(filePath)) return null;
    return parseLocalFile(filePath);
  }

  if (!process.env.BLOG_GITHUB_TOKEN?.trim()) return null;

  const repoPath = blogContentRepoPath(normalized);
  const file = await githubGetTextFile(repoPath);
  if (!file) return null;
  return parseBlogMarkdown(file.text, repoPath);
}
