import { normalizePostgresDatabaseUrl } from "@salanor/db-url";
import pg from "pg";

export type ResearchPostPublic = {
  id: string;
  slug: string;
  title: string;
  dek: string;
  body: string;
  bodyHtml: string;
  track: string;
  publishedAt: string | null;
  updatedAt: string;
  readingMinutes: number;
  heroImageUrl: string | null;
  ogImageUrl: string | null;
  authorName: string | null;
  authorRole: string | null;
  authorPhotoUrl: string | null;
  authorLinkedinUrl: string | null;
  authorXUrl: string | null;
  authorInstagramUrl: string | null;
};

type Row = {
  id: string;
  slug: string;
  title: string;
  dek: string;
  body: string;
  track: string;
  published_at: Date | null;
  updated_at: Date;
  reading_minutes: number;
  hero_image_url: string | null;
  og_image_url: string | null;
};

function pool(): pg.Pool | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  return new pg.Pool({
    connectionString: normalizePostgresDatabaseUrl(url),
    max: 2,
  });
}

export async function listPublishedResearch(): Promise<Omit<ResearchPostPublic, "body" | "bodyHtml">[]> {
  const p = pool();
  if (!p) return [];
  try {
    const res = await p.query<
      Row & {
        author_name: string | null;
        author_role: string | null;
        author_photo_url: string | null;
        author_linkedin_url: string | null;
        author_x_url: string | null;
        author_instagram_url: string | null;
      }
    >(
      `SELECT rp.id, rp.slug, rp.title, rp.dek, rp.body, rp.track, rp.published_at, rp.updated_at,
              rp.reading_minutes, rp.hero_image_url, rp.og_image_url,
              ac.byline_name AS author_name, ac.byline_title AS author_role,
              ac.byline_photo_url AS author_photo_url,
              ac.byline_linkedin_url AS author_linkedin_url,
              ac.byline_x_url AS author_x_url,
              ac.byline_instagram_url AS author_instagram_url
       FROM research_posts rp
       LEFT JOIN account ac ON ac.account_id = rp.author_account_id
       WHERE rp.status = 'published'
       ORDER BY rp.published_at DESC NULLS LAST, rp.updated_at DESC
       LIMIT 100`,
    );
    return res.rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      dek: r.dek,
      track: r.track,
      publishedAt: r.published_at?.toISOString() ?? null,
      updatedAt: r.updated_at.toISOString(),
      readingMinutes: r.reading_minutes,
      heroImageUrl: r.hero_image_url,
      ogImageUrl: r.og_image_url,
      authorName: r.author_name,
      authorRole: r.author_role,
      authorPhotoUrl: r.author_photo_url,
      authorLinkedinUrl: r.author_linkedin_url,
      authorXUrl: r.author_x_url,
      authorInstagramUrl: r.author_instagram_url,
    }));
  } catch {
    return [];
  } finally {
    await p.end().catch(() => undefined);
  }
}

export async function getPublishedResearchBySlug(slug: string): Promise<ResearchPostPublic | null> {
  const p = pool();
  if (!p) return null;
  const { markdownToSafeHtml } = await import("./markdown");
  try {
    const res = await p.query<
      Row & {
        author_name: string | null;
        author_role: string | null;
        author_photo_url: string | null;
        author_linkedin_url: string | null;
        author_x_url: string | null;
        author_instagram_url: string | null;
      }
    >(
      `SELECT rp.id, rp.slug, rp.title, rp.dek, rp.body, rp.track, rp.published_at, rp.updated_at,
              rp.reading_minutes, rp.hero_image_url, rp.og_image_url,
              ac.byline_name AS author_name, ac.byline_title AS author_role,
              ac.byline_photo_url AS author_photo_url,
              ac.byline_linkedin_url AS author_linkedin_url,
              ac.byline_x_url AS author_x_url,
              ac.byline_instagram_url AS author_instagram_url
       FROM research_posts rp
       LEFT JOIN account ac ON ac.account_id = rp.author_account_id
       WHERE lower(rp.slug) = lower($1) AND rp.status = 'published'
       LIMIT 1`,
      [slug.trim()],
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
      id: r.id,
      slug: r.slug,
      title: r.title,
      dek: r.dek,
      body: r.body,
      bodyHtml: markdownToSafeHtml(r.body),
      track: r.track,
      publishedAt: r.published_at?.toISOString() ?? null,
      updatedAt: r.updated_at.toISOString(),
      readingMinutes: r.reading_minutes,
      heroImageUrl: r.hero_image_url,
      ogImageUrl: r.og_image_url,
      authorName: r.author_name,
      authorRole: r.author_role,
      authorPhotoUrl: r.author_photo_url,
      authorLinkedinUrl: r.author_linkedin_url,
      authorXUrl: r.author_x_url,
      authorInstagramUrl: r.author_instagram_url,
    };
  } catch {
    return null;
  } finally {
    await p.end().catch(() => undefined);
  }
}
