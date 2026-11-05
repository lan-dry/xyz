import { randomUUID } from "node:crypto";

import { normalizePostgresDatabaseUrl } from "@salanor/db-url";
import { marked } from "marked";
import pg from "pg";

import type { BlogEditorContext, BlogMarkdownPost, BlogPostSaveInput } from "./types";

export type StoredBlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  contentHtml: string;
  coverImageUrl: string | null;
  authorName: string;
  authorRole: string | null;
  authorAccountId: string | null;
  authorEmail: string | null;
  tags: string[];
  status: "draft" | "published";
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  seoTitle: string | null;
  seoDescription: string | null;
  createdByEmail: string | null;
  lastEditedByEmail: string | null;
};

type Row = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body_markdown: string;
  content_html: string;
  cover_image_url: string | null;
  author_name: string;
  author_role: string | null;
  author_account_id: string | null;
  author_email: string | null;
  tags: string[] | null;
  status: string;
  published_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  seo_title: string | null;
  seo_description: string | null;
  created_by_email: string | null;
  last_edited_by_email: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SELECT_LIST = `
  id, slug, title, excerpt, body_markdown, content_html, cover_image_url,
  author_name, author_role, author_account_id, author_email, tags, status,
  published_at, created_at, updated_at, seo_title, seo_description,
  created_by_email, last_edited_by_email
`;

let pool: pg.Pool | null = null;
let backfillChecked = false;

export function blogDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function getPool(): pg.Pool {
  if (pool) return pool;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is required for blog storage");
  pool = new pg.Pool({
    connectionString: normalizePostgresDatabaseUrl(url),
    max: 4,
  });
  return pool;
}

function explainDbError(err: unknown): never {
  const code = (err as { code?: string }).code;
  if (code === "42703" || code === "42P01") {
    throw new Error(
      "Blog storage needs migration 013_blog_database_source. From the repo root run: pnpm db:migrate",
    );
  }
  throw err;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapRow(row: Row): StoredBlogPost {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt ?? "",
    bodyMarkdown: row.body_markdown ?? "",
    contentHtml: row.content_html ?? "",
    coverImageUrl: row.cover_image_url,
    authorName: row.author_name,
    authorRole: row.author_role,
    authorAccountId: row.author_account_id,
    authorEmail: row.author_email,
    tags: row.tags ?? [],
    status: row.status === "published" ? "published" : "draft",
    publishedAt: toIso(row.published_at),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    createdByEmail: row.created_by_email,
    lastEditedByEmail: row.last_edited_by_email,
  };
}

function toMarkdownPost(post: StoredBlogPost): BlogMarkdownPost {
  return {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    authorName: post.authorName,
    authorRole: post.authorRole,
    tags: post.tags,
    status: post.status,
    publishedAt: post.publishedAt,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    coverImageUrl: post.coverImageUrl,
    authorAccountId: post.authorAccountId,
    authorEmail: post.authorEmail,
    createdByEmail: post.createdByEmail,
    lastEditedByEmail: post.lastEditedByEmail,
    lastEditedAt: post.updatedAt,
    bodyMarkdown: post.bodyMarkdown,
    filePath: `db://${post.slug}`,
  };
}

function renderHtml(markdown: string): string {
  const body = markdown.replace(/\r\n/g, "\n").trim();
  if (!body) return "";
  return marked.parse(body, { async: false }) as string;
}

function accountIdOrNull(value: string | null | undefined): string | null {
  const id = value?.trim();
  if (!id || !UUID_RE.test(id)) return null;
  return id;
}

export async function backfillBlogFromMarkdown(posts: BlogMarkdownPost[]): Promise<void> {
  if (!blogDatabaseConfigured() || backfillChecked || posts.length === 0) return;
  backfillChecked = true;
  try {
    const count = await getPool().query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM marketing_blog_posts`,
    );
    if ((count.rows[0]?.n ?? 0) > 0) return;

    for (const post of posts) {
      const html = renderHtml(post.bodyMarkdown);
      await getPool().query(
        `INSERT INTO marketing_blog_posts (
           id, slug, title, excerpt, content_html, body_markdown, cover_image_url,
           author_name, author_role, author_account_id, author_email, tags, status,
           published_at, seo_title, seo_description, created_by_email, last_edited_by_email
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
         )
         ON CONFLICT (slug) DO NOTHING`,
        [
          randomUUID(),
          post.slug.trim().toLowerCase(),
          post.title,
          post.excerpt,
          html,
          post.bodyMarkdown,
          post.coverImageUrl ?? null,
          post.authorName || "Salanor",
          post.authorRole ?? null,
          accountIdOrNull(post.authorAccountId),
          post.authorEmail ?? null,
          post.tags ?? [],
          post.status === "published" ? "published" : "draft",
          post.publishedAt ?? null,
          post.seoTitle ?? null,
          post.seoDescription ?? null,
          post.createdByEmail ?? null,
          post.lastEditedByEmail ?? null,
        ],
      );
    }
  } catch (err) {
    backfillChecked = false;
    explainDbError(err);
  }
}

export async function listStoredBlogPosts(options?: {
  status?: "draft" | "published" | "all";
  tag?: string;
  /** Hide drafts and posts whose publish time is still in the future. */
  liveOnly?: boolean;
}): Promise<StoredBlogPost[]> {
  const status = options?.status ?? "all";
  const tag = options?.tag?.trim().toLowerCase();
  const params: unknown[] = [];
  const clauses: string[] = [];

  if (options?.liveOnly) {
    clauses.push(`status = 'published'`);
    clauses.push(`(published_at IS NULL OR published_at <= now())`);
  } else if (status !== "all") {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  }
  if (tag) {
    params.push(tag);
    clauses.push(`EXISTS (SELECT 1 FROM unnest(tags) t WHERE lower(t) = $${params.length})`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  try {
    const result = await getPool().query<Row>(
      `SELECT ${SELECT_LIST} FROM marketing_blog_posts ${where}
       ORDER BY COALESCE(published_at, updated_at) DESC`,
      params,
    );
    return result.rows.map(mapRow);
  } catch (err) {
    explainDbError(err);
  }
}

export async function getStoredBlogPostBySlug(slug: string): Promise<StoredBlogPost | null> {
  try {
    const result = await getPool().query<Row>(
      `SELECT ${SELECT_LIST} FROM marketing_blog_posts WHERE slug = $1 LIMIT 1`,
      [slug.trim().toLowerCase()],
    );
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  } catch (err) {
    explainDbError(err);
  }
}

export function storedPostAsMarkdown(post: StoredBlogPost): BlogMarkdownPost {
  return toMarkdownPost(post);
}

export async function saveStoredBlogPost(
  input: BlogPostSaveInput,
  ctx: BlogEditorContext,
  previousSlug?: string | null,
): Promise<{ slug: string }> {
  const slug = input.slug.trim().toLowerCase();
  const status = input.status === "published" ? "published" : "draft";
  const publishedAt =
    status === "published"
      ? (input.publishedAt?.trim() ? new Date(input.publishedAt).toISOString() : new Date().toISOString())
      : null;
  const authorAccountId = accountIdOrNull(
    ctx.isCreate ? ctx.editorAccountId : ctx.priorAuthorAccountId || ctx.editorAccountId,
  );
  const authorEmail = (
    ctx.isCreate ? ctx.editorEmail : ctx.priorAuthorEmail || ctx.editorEmail
  )
    .trim()
    .toLowerCase();
  const html = renderHtml(input.bodyMarkdown);
  const tags = (input.tags ?? []).map((t) => t.trim()).filter(Boolean);

  try {
    if (previousSlug) {
      const result = await getPool().query(
        `UPDATE marketing_blog_posts SET
           slug = $2,
           title = $3,
           excerpt = $4,
           content_html = $5,
           body_markdown = $6,
           cover_image_url = $7,
           author_name = $8,
           author_role = $9,
           author_account_id = COALESCE($10, author_account_id),
           author_email = COALESCE($11, author_email),
           tags = $12,
           status = $13,
           published_at = $14,
           seo_title = $15,
           seo_description = $16,
           last_edited_by_email = $17,
           updated_at = now()
         WHERE slug = $1`,
        [
          previousSlug.trim().toLowerCase(),
          slug,
          input.title.trim(),
          input.excerpt.trim(),
          html,
          input.bodyMarkdown.replace(/\r\n/g, "\n"),
          input.coverImageUrl?.trim() || null,
          input.authorName.trim(),
          input.authorRole?.trim() || null,
          authorAccountId,
          authorEmail,
          tags,
          status,
          publishedAt,
          input.seoTitle?.trim() || null,
          input.seoDescription?.trim() || null,
          ctx.editorEmail,
        ],
      );
      if ((result.rowCount ?? 0) === 0) throw new Error("Post not found");
      return { slug };
    }

    await getPool().query(
      `INSERT INTO marketing_blog_posts (
         id, slug, title, excerpt, content_html, body_markdown, cover_image_url,
         author_name, author_role, author_account_id, author_email, tags, status,
         published_at, seo_title, seo_description, created_by_user_id, updated_by_user_id,
         created_by_email, last_edited_by_email
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17,$18,$18
       )`,
      [
        randomUUID(),
        slug,
        input.title.trim(),
        input.excerpt.trim(),
        html,
        input.bodyMarkdown.replace(/\r\n/g, "\n"),
        input.coverImageUrl?.trim() || null,
        input.authorName.trim(),
        input.authorRole?.trim() || null,
        authorAccountId,
        authorEmail,
        tags,
        status,
        publishedAt,
        input.seoTitle?.trim() || null,
        input.seoDescription?.trim() || null,
        accountIdOrNull(ctx.editorAccountId),
        ctx.editorEmail,
      ],
    );
    return { slug };
  } catch (err) {
    explainDbError(err);
  }
}
