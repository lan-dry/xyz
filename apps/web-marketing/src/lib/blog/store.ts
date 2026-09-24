import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

import {
  getGitBlogPostById,
  getGitBlogPostBySlug,
  gitBlogContentEnabled,
  listGitBlogPosts as listGitBlogPosts,
} from "./git-content";
import { sanitizeBlogHtml } from "./sanitize";
import type { BlogPost, BlogPostInput, BlogPostListItem, BlogPostStatus } from "./types";
import { readingTimeMinutes, slugify } from "./utils";

/** Legacy DB/JSON write path only (Git is the production source). */
type BlogPublisherContext = {
  userId: string;
  email: string;
  displayName: string | null;
};

let pool: pg.Pool | null = null;

type BlogRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content_html: string;
  cover_image_url: string | null;
  author_name: string;
  author_role: string | null;
  tags: string[];
  status: BlogPostStatus;
  published_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  seo_title: string | null;
  seo_description: string | null;
  last_published_by_email: string | null;
};

function useDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function getPool(): pg.Pool {
  if (pool) return pool;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is required for blog storage");
  pool = new pg.Pool({ connectionString: url, max: 4 });
  return pool;
}

function blogDataFile(): string {
  const configured = process.env.BLOG_DATA_PATH?.trim();
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.join(process.cwd(), configured);
  }
  return path.join(process.cwd(), "data", "blog", "posts.json");
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapRow(row: BlogRow): BlogPost {
  const contentHtml = row.content_html ?? "";
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt ?? "",
    contentHtml,
    coverImageUrl: row.cover_image_url,
    authorName: row.author_name,
    authorRole: row.author_role,
    tags: row.tags ?? [],
    status: row.status,
    publishedAt: toIso(row.published_at),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    readingTimeMinutes: readingTimeMinutes(contentHtml),
    lastPublishedByEmail: row.last_published_by_email ?? null,
  };
}

function toListItem(post: BlogPost): BlogPostListItem {
  const {
    id,
    slug,
    title,
    excerpt,
    coverImageUrl,
    authorName,
    authorRole,
    tags,
    status,
    publishedAt,
    createdAt,
    updatedAt,
    readingTimeMinutes: rt,
  } = post;
  return {
    id,
    slug,
    title,
    excerpt,
    coverImageUrl,
    authorName,
    authorRole,
    tags,
    status,
    publishedAt,
    createdAt,
    updatedAt,
    readingTimeMinutes: rt,
  };
}

function readFilePosts(): BlogPost[] {
  const file = blogDataFile();
  if (!existsSync(file)) return [];
  try {
    const raw = readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as BlogPost[];
    return Array.isArray(parsed) ? parsed.map((p) => mapRow(normalizeFileRow(p))) : [];
  } catch {
    return [];
  }
}

function normalizeFileRow(post: BlogPost): BlogRow {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    content_html: post.contentHtml,
    cover_image_url: post.coverImageUrl,
    author_name: post.authorName,
    author_role: post.authorRole,
    tags: post.tags,
    status: post.status,
    published_at: post.publishedAt,
    created_at: post.createdAt,
    updated_at: post.updatedAt,
    seo_title: post.seoTitle,
    seo_description: post.seoDescription,
    last_published_by_email: post.lastPublishedByEmail ?? null,
  };
}

function writeFilePosts(posts: BlogPost[]): void {
  const file = blogDataFile();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(posts, null, 2), "utf8");
}

function normalizeInput(input: BlogPostInput, existing?: BlogPost): BlogPostInput {
  const title = input.title.trim();
  const slug = (input.slug?.trim() || slugify(title) || `post-${Date.now()}`).toLowerCase();
  const status = input.status ?? existing?.status ?? "draft";
  const now = new Date().toISOString();
  let publishedAt = input.publishedAt ?? existing?.publishedAt ?? null;
  if (status === "published" && !publishedAt) {
    publishedAt = now;
  }
  if (status === "draft") {
    publishedAt = null;
  }

  return {
    slug,
    title,
    excerpt: input.excerpt.trim(),
    contentHtml: sanitizeBlogHtml(input.contentHtml),
    coverImageUrl: input.coverImageUrl?.trim() || null,
    authorName: input.authorName?.trim() || existing?.authorName || "Landry Bougang",
    authorRole: input.authorRole?.trim() || existing?.authorRole || "Founder, Salanor",
    tags: (input.tags ?? existing?.tags ?? []).map((t) => t.trim()).filter(Boolean),
    status,
    publishedAt,
    seoTitle: input.seoTitle?.trim() || null,
    seoDescription: input.seoDescription?.trim() || null,
  };
}

async function ensureUniqueSlug(slug: string, excludeId?: string): Promise<string> {
  let candidate = slug;
  let suffix = 2;
  while (await slugExists(candidate, excludeId)) {
    candidate = `${slug}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

async function slugExists(slug: string, excludeId?: string): Promise<boolean> {
  if (useDatabase()) {
    const result = await getPool().query<{ id: string }>(
      `SELECT id FROM marketing_blog_posts WHERE slug = $1 LIMIT 1`,
      [slug],
    );
    const row = result.rows[0];
    if (!row) return false;
    return excludeId ? row.id !== excludeId : true;
  }
  const posts = readFilePosts();
  return posts.some((p) => p.slug === slug && p.id !== excludeId);
}

export async function listBlogPosts(options?: {
  status?: BlogPostStatus | "all";
  tag?: string;
  includeDrafts?: boolean;
}): Promise<BlogPostListItem[]> {
  const status = options?.status ?? (options?.includeDrafts ? "all" : "published");
  const tag = options?.tag?.trim().toLowerCase();

  if (gitBlogContentEnabled()) {
    return listGitBlogPosts({ status, tag, includeDrafts: options?.includeDrafts });
  }

  if (useDatabase()) {
    const params: unknown[] = [];
    const clauses: string[] = [];
    if (status !== "all") {
      params.push(status);
      clauses.push(`status = $${params.length}`);
    }
    if (tag) {
      params.push(tag);
      clauses.push(`EXISTS (SELECT 1 FROM unnest(tags) t WHERE lower(t) = $${params.length})`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await getPool().query<BlogRow>(
      `SELECT * FROM marketing_blog_posts ${where}
       ORDER BY COALESCE(published_at, created_at) DESC`,
      params,
    );
    return result.rows.map((row) => toListItem(mapRow(row)));
  }

  let posts = readFilePosts();
  if (status !== "all") {
    posts = posts.filter((p) => p.status === status);
  }
  if (tag) {
    posts = posts.filter((p) => p.tags.some((t) => t.toLowerCase() === tag));
  }
  posts.sort(
    (a, b) =>
      new Date(b.publishedAt ?? b.createdAt).getTime() -
      new Date(a.publishedAt ?? a.createdAt).getTime(),
  );
  return posts.map(toListItem);
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPost | null> {
  if (gitBlogContentEnabled()) {
    return getGitBlogPostBySlug(slug);
  }

  if (useDatabase()) {
    const result = await getPool().query<BlogRow>(
      `SELECT * FROM marketing_blog_posts WHERE slug = $1 LIMIT 1`,
      [slug],
    );
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  }
  const post = readFilePosts().find((p) => p.slug === slug);
  return post ?? null;
}

export async function getBlogPostById(id: string): Promise<BlogPost | null> {
  if (gitBlogContentEnabled()) {
    return getGitBlogPostById(id);
  }

  if (useDatabase()) {
    const result = await getPool().query<BlogRow>(
      `SELECT * FROM marketing_blog_posts WHERE id = $1 LIMIT 1`,
      [id],
    );
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  }
  const post = readFilePosts().find((p) => p.id === id);
  return post ?? null;
}

export async function createBlogPost(
  input: BlogPostInput,
  publisher?: BlogPublisherContext,
): Promise<BlogPost> {
  const normalized = normalizeInput(input);
  const slug = await ensureUniqueSlug(normalized.slug!);
  const id = randomUUID();
  const now = new Date().toISOString();
  const authorName =
    normalized.authorName?.trim() ||
    publisher?.displayName?.trim() ||
    publisher?.email ||
    "Salanor";
  const isPublished = normalized.status === "published";

  if (useDatabase()) {
    const result = await getPool().query<BlogRow>(
      `INSERT INTO marketing_blog_posts (
         id, slug, title, excerpt, content_html, cover_image_url,
         author_name, author_role, tags, status, published_at,
         seo_title, seo_description,
         created_by_user_id, updated_by_user_id, published_by_user_id, last_published_by_email
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        id,
        slug,
        normalized.title,
        normalized.excerpt,
        normalized.contentHtml,
        normalized.coverImageUrl,
        authorName,
        normalized.authorRole,
        normalized.tags,
        normalized.status,
        normalized.publishedAt,
        normalized.seoTitle,
        normalized.seoDescription,
        publisher?.userId ?? null,
        publisher?.userId ?? null,
        isPublished ? (publisher?.userId ?? null) : null,
        isPublished ? (publisher?.email ?? null) : null,
      ],
    );
    return mapRow(result.rows[0]!);
  }

  const post = mapRow({
    id,
    slug,
    title: normalized.title!,
    excerpt: normalized.excerpt!,
    content_html: normalized.contentHtml!,
    cover_image_url: normalized.coverImageUrl ?? null,
    author_name: normalized.authorName!,
    author_role: normalized.authorRole ?? null,
    tags: normalized.tags ?? [],
    status: normalized.status!,
    published_at: normalized.publishedAt ?? null,
    created_at: now,
    updated_at: now,
    seo_title: normalized.seoTitle ?? null,
    seo_description: normalized.seoDescription ?? null,
    last_published_by_email: isPublished ? (publisher?.email ?? null) : null,
  });
  const posts = readFilePosts();
  posts.unshift(post);
  writeFilePosts(posts);
  return post;
}

export async function updateBlogPost(
  id: string,
  input: BlogPostInput,
  publisher?: BlogPublisherContext,
): Promise<BlogPost | null> {
  const existing = await getBlogPostById(id);
  if (!existing) return null;

  const normalized = normalizeInput(input, existing);
  let slug = normalized.slug!;
  if (slug !== existing.slug) {
    slug = await ensureUniqueSlug(slug, id);
  }
  const becamePublished =
    normalized.status === "published" && existing.status !== "published";
  if (useDatabase()) {
    const result = await getPool().query<BlogRow>(
      `UPDATE marketing_blog_posts SET
         slug = $2, title = $3, excerpt = $4, content_html = $5,
         cover_image_url = $6, author_name = $7, author_role = $8,
         tags = $9, status = $10, published_at = $11,
         seo_title = $12, seo_description = $13, updated_at = now(),
         updated_by_user_id = $14,
         published_by_user_id = CASE
           WHEN $10 = 'published' THEN COALESCE($15, published_by_user_id)
           WHEN $10 = 'draft' THEN NULL
           ELSE published_by_user_id
         END,
         last_published_by_email = CASE
           WHEN $10 = 'published' AND ($16::text IS NOT NULL) THEN $16
           WHEN $10 = 'draft' THEN NULL
           ELSE last_published_by_email
         END
       WHERE id = $1
       RETURNING *`,
      [
        id,
        slug,
        normalized.title,
        normalized.excerpt,
        normalized.contentHtml,
        normalized.coverImageUrl,
        normalized.authorName,
        normalized.authorRole,
        normalized.tags,
        normalized.status,
        normalized.publishedAt,
        normalized.seoTitle,
        normalized.seoDescription,
        publisher?.userId ?? null,
        becamePublished || normalized.status === "published" ? (publisher?.userId ?? null) : null,
        becamePublished && publisher?.email ? publisher.email : null,
      ],
    );
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  }

  const posts = readFilePosts();
  const index = posts.findIndex((p) => p.id === id);
  if (index < 0) return null;
  const updated = mapRow({
    id,
    slug,
    title: normalized.title!,
    excerpt: normalized.excerpt!,
    content_html: normalized.contentHtml!,
    cover_image_url: normalized.coverImageUrl ?? null,
    author_name: normalized.authorName!,
    author_role: normalized.authorRole ?? null,
    tags: normalized.tags ?? [],
    status: normalized.status!,
    published_at: normalized.publishedAt ?? null,
    created_at: existing.createdAt,
    updated_at: new Date().toISOString(),
    seo_title: normalized.seoTitle ?? null,
    seo_description: normalized.seoDescription ?? null,
    last_published_by_email:
      normalized.status === "published"
        ? (publisher?.email ?? existing.lastPublishedByEmail ?? null)
        : null,
  });
  posts[index] = updated;
  writeFilePosts(posts);
  return updated;
}

export async function deleteBlogPost(id: string): Promise<boolean> {
  if (useDatabase()) {
    const result = await getPool().query(`DELETE FROM marketing_blog_posts WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }
  const posts = readFilePosts();
  const next = posts.filter((p) => p.id !== id);
  if (next.length === posts.length) return false;
  writeFilePosts(next);
  return true;
}

export async function getPublishedBlogSlugs(): Promise<Array<{ slug: string; updatedAt: string }>> {
  const posts = await listBlogPosts({ status: "published" });
  return posts.map((p) => ({ slug: p.slug, updatedAt: p.updatedAt }));
}
