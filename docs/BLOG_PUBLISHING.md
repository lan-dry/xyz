# Blog — decisions and operations

## Final decision (keep this)

| Topic | Choice |
|-------|--------|
| **Content format** | **Markdown in Git** (`apps/web-marketing/content/blog/*.md`) |
| **Beauty on the site** | Same as MD: build step turns Markdown → HTML → your **existing** Salanor blog layout (typography, TOC, cards). CMS does not look “prettier”; it only changes *where* people type. |
| **Publish** | Merge to `main` → Vercel deploy → live |
| **Public author & date** | YAML frontmatter: `authorName`, `authorRole`, `publishedAt` |
| **Internal accountability** | Git commit author + PR reviewers (standard for Method 1) |
| **Contentful / Sanity** | **Not used** |
| **Staff UI** | **Platform Ops** → **Content → Blog** (`ops.salanor.com/content/blog`, local `:3003`) — same `.md` as Cursor. Roles: platform staff read-only; admin/superadmin write. |
| **Visual editor (optional)** | **Pages CMS** (`.pages.yml`) — same Git files; optional for contractors. |
| **Legacy** | `apps/web` `/admin/*` deep-links to Ops; do not add `admin.salanor.com`. |
| **Listen** | **On** — “Play audio” on each article (browser text-to-speech) |
| **Stats** | **GA4** (site-wide) + **first-party events** in Postgres (`blog_engagement_events`) when `DATABASE_URL` is set on marketing |

You are not being told to “wait because you’re alone.” Building listen + stats + Git workflow **now** is valid product work while you have no clients.

---

## Publish a post

See `apps/web-marketing/content/blog/README.md`.

## Images & video

See `docs/blog/MEDIA.md` — files under `public/blog/media/`, YouTube/Vimeo embeds in Markdown.

## Pages CMS (visual editor, optional to activate)

1. Repo already contains `.pages.yml` (paths, fields, media upload folder).
2. Go to [pagescms.org](https://pagescms.org) → add repository → install GitHub App.
3. Editors use **pagescms.org**, not an admin area on www.salanor.com.
4. Uploads land in `apps/web-marketing/public/blog/media` with URLs `/blog/media/...`.

---

## Stats — what you get

### Google Analytics 4

Set `NEXT_PUBLIC_GA_MEASUREMENT_ID` on Vercel. In GA4: **Reports → Engagement → Pages and screens** (filter `/blog/`).

Custom events (also sent to GA when gtag loads):

- `blog_page_view`, `blog_time_on_page`, `blog_scroll_depth`
- `blog_listen_start`, `blog_listen_seconds`, `blog_listen_complete`
- `blog_share_click`, `blog_copy_link`

### First-party (your database)

After `pnpm db:migrate` (includes **033**) and `DATABASE_URL` on **web-marketing**:

Events are stored in **`blog_engagement_events`**.

Ready-made SQL: **`docs/blog/STATS-QUERIES.sql`**

| Metric | Event(s) |
|--------|----------|
| Views | `page_view` |
| Distinct sessions (≈ visitors) | distinct `session_key` on `page_view` |
| By day | `page_view` grouped by `created_at` |
| Time on page | `time_on_page` (buckets + final seconds on leave) |
| Scroll depth | `scroll_depth` (25/50/75/90%) |
| Listen usage | `listen_start`, `listen_seconds`, `listen_complete` |
| Shares / copy | `share_click`, `copy_link` |

Optional: `BLOG_ENGAGEMENT_SALT` on Vercel (pepper for IP hash in metadata).

---

## Listen feature

Uses the browser **Speech Synthesis API** (no extra API cost). Quality depends on OS/voice (best on Chrome/Edge). Tracks listen time for stats.

Upgrade path later: pre-render MP3 with ElevenLabs and `<audio src>` — same UI hook.

---

## Legacy

Postgres `marketing_blog_posts` and migrations 031–032 are unused when Git content exists. `BLOG_CONTENT_GIT=0` forces DB/JSON fallback.
