-- Public author profile: optional social links (blog / research byline).

ALTER TABLE account
  ADD COLUMN IF NOT EXISTS byline_linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS byline_x_url TEXT,
  ADD COLUMN IF NOT EXISTS byline_instagram_url TEXT;

COMMENT ON COLUMN account.byline_linkedin_url IS 'Optional LinkedIn profile URL for public byline.';
COMMENT ON COLUMN account.byline_x_url IS 'Optional X (Twitter) profile URL for public byline.';
COMMENT ON COLUMN account.byline_instagram_url IS 'Optional Instagram profile URL for public byline.';
