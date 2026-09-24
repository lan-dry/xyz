-- Blog engagement (first-party). Run after migration 032_blog_engagement_events.
-- Requires DATABASE_URL on marketing Vercel + pnpm db:migrate.

-- Page views per article (all time)
SELECT slug, COUNT(*) AS views
FROM blog_engagement_events
WHERE event_name = 'page_view'
GROUP BY slug
ORDER BY views DESC;

-- Unique sessions per article (approx. distinct visitors)
SELECT slug, COUNT(DISTINCT session_key) AS unique_sessions
FROM blog_engagement_events
WHERE event_name = 'page_view'
GROUP BY slug
ORDER BY unique_sessions DESC;

-- Views by day
SELECT date_trunc('day', created_at AT TIME ZONE 'UTC') AS day, COUNT(*) AS views
FROM blog_engagement_events
WHERE event_name = 'page_view'
GROUP BY 1
ORDER BY 1 DESC;

-- Listen starts and total listen seconds (sum of listen_seconds events)
SELECT slug,
       COUNT(*) FILTER (WHERE event_name = 'listen_start') AS listen_starts,
       COALESCE(SUM(value_num) FILTER (WHERE event_name = 'listen_seconds'), 0) AS listen_seconds
FROM blog_engagement_events
GROUP BY slug;

-- Share clicks by network (metadata->>'network')
SELECT slug, metadata->>'network' AS network, COUNT(*) AS clicks
FROM blog_engagement_events
WHERE event_name = 'share_click'
GROUP BY slug, metadata->>'network';
