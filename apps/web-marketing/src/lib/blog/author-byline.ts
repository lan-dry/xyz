import { normalizePostgresDatabaseUrl } from "@salanor/db-url";
import pg from "pg";

import type { BlogPost } from "./types";

export type BlogAuthorDisplay = {
  name: string;
  role: string | null;
  photoUrl: string | null;
  linkedinUrl: string | null;
  xUrl: string | null;
  instagramUrl: string | null;
};

type BylineRow = {
  byline_name: string | null;
  byline_title: string | null;
  byline_photo_url: string | null;
  byline_linkedin_url: string | null;
  byline_x_url: string | null;
  byline_instagram_url: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fallbackFromPost(post: BlogPost): BlogAuthorDisplay {
  return {
    name: post.authorName,
    role: post.authorRole,
    photoUrl: null,
    linkedinUrl: null,
    xUrl: null,
    instagramUrl: null,
  };
}

function rowToDisplay(row: BylineRow, post: BlogPost): BlogAuthorDisplay {
  return {
    name: row.byline_name?.trim() || post.authorName,
    role: row.byline_title?.trim() || post.authorRole,
    photoUrl: row.byline_photo_url?.trim() || null,
    linkedinUrl: row.byline_linkedin_url?.trim() || null,
    xUrl: row.byline_x_url?.trim() || null,
    instagramUrl: row.byline_instagram_url?.trim() || null,
  };
}

export async function resolveBlogAuthorDisplay(post: BlogPost): Promise<BlogAuthorDisplay> {
  const fallback = fallbackFromPost(post);
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return fallback;

  const accountId = post.authorAccountId?.trim();
  const email = post.authorEmail?.trim().toLowerCase();
  if (!accountId && !email) return fallback;

  const pool = new pg.Pool({
    connectionString: normalizePostgresDatabaseUrl(databaseUrl),
    max: 1,
  });

  try {
    if (accountId && UUID_RE.test(accountId)) {
      const byId = await pool.query<BylineRow>(
        `SELECT
           byline_name, byline_title, byline_photo_url,
           byline_linkedin_url, byline_x_url, byline_instagram_url
         FROM account
         WHERE account_id = $1::uuid AND active = true
         LIMIT 1`,
        [accountId],
      );
      if (byId.rows[0]) return rowToDisplay(byId.rows[0], post);
    }

    if (email) {
      const byEmail = await pool.query<BylineRow>(
        `SELECT
           byline_name, byline_title, byline_photo_url,
           byline_linkedin_url, byline_x_url, byline_instagram_url
         FROM account
         WHERE lower(trim(email)) = $1 AND active = true
         LIMIT 1`,
        [email],
      );
      if (byEmail.rows[0]) return rowToDisplay(byEmail.rows[0], post);
    }

    return fallback;
  } catch {
    return fallback;
  } finally {
    await pool.end();
  }
}
