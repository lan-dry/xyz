-- Blog posts are stored in Postgres. Markdown export is optional; Git files are not the production source.

ALTER TABLE marketing_blog_posts
  ADD COLUMN IF NOT EXISTS body_markdown TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS author_account_id UUID,
  ADD COLUMN IF NOT EXISTS author_email TEXT,
  ADD COLUMN IF NOT EXISTS created_by_email TEXT,
  ADD COLUMN IF NOT EXISTS last_edited_by_email TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketing_blog_posts_author_account_id_fkey'
  ) THEN
    ALTER TABLE marketing_blog_posts
      ADD CONSTRAINT marketing_blog_posts_author_account_id_fkey
      FOREIGN KEY (author_account_id) REFERENCES account (account_id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN marketing_blog_posts.body_markdown IS
  'Editor source for Platform Ops. Public pages render content_html. Git markdown is an export, not the source of truth.';
