# Salanor blog content (Git-as-CMS)

Posts are **Markdown files in this folder**. Public site: `/blog/{slug}`.

## Two ways to edit (same files)

| Who | Tool |
|-----|------|
| **You (now)** | Cursor / VS Code — fastest |
| **Staff (CMS permission)** | Salanor staff admin → **Blog** (`/admin/blog`) — same `.md` files, markdown + media upload |
| **Optional** | [Pages CMS](https://pagescms.org) — external UI on the same files (`.pages.yml`) |

No Contentful. No secret admin on www.salanor.com.

### One-time Pages CMS setup

1. Sign in at [pagescms.org](https://pagescms.org) and install the GitHub App on `salanor-ltd/salanor`.
2. Open the **Blog posts** collection — edit or create `.md` files.
3. Merge to `main` → Vercel deploys (same as PR workflow).

Until you connect Pages CMS, ignore step 1 and edit here in the repo.

## Publish workflow

1. Edit frontmatter + body (or use Pages CMS).
2. `status: published` + `publishedAt` (ISO).
3. PR → review → merge → live.

Drafts: `status: draft` — hidden on `/blog`.

## Frontmatter

| Field | Required | Notes |
|-------|----------|--------|
| `title` | yes | |
| `slug` | yes | URL segment |
| `excerpt` | yes | Listing + SEO |
| `authorName` | yes | Public byline |
| `authorRole` | no | |
| `tags` | no | YAML list |
| `status` | yes | `draft` or `published` |
| `publishedAt` | if published | ISO-8601 |
| `seoTitle` / `seoDescription` | no | |
| `coverImageUrl` | no | Hero on `/blog` listing + LinkedIn/X preview. Empty → `/blog/default-og.png` |
| `tags` | no | YAML list, e.g. `tags: [Governance, Finance]` — shown on cards; filter via `/blog?tag=…`. Editable in Ops **Blog** or here |

Body: Markdown below `---`. **Images & video in the article:** see `docs/blog/MEDIA.md`. Regenerate default share card: `python docs/brand/build-blog-og.py`.
