CREATE TABLE IF NOT EXISTS marketing_blog_posts (
  id                UUID PRIMARY KEY,
  slug              TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  excerpt           TEXT NOT NULL DEFAULT '',
  content_html      TEXT NOT NULL DEFAULT '',
  cover_image_url   TEXT,
  author_name       TEXT NOT NULL DEFAULT 'Landry Bougang',
  author_role       TEXT,
  tags              TEXT[] NOT NULL DEFAULT '{}',
  status            TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  published_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  seo_title         TEXT,
  seo_description   TEXT
);

CREATE INDEX IF NOT EXISTS marketing_blog_posts_status_published_at_idx
  ON marketing_blog_posts (status, published_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS marketing_blog_posts_slug_idx
  ON marketing_blog_posts (slug);
