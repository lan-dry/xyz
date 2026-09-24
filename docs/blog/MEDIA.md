# Blog media (images & video)

All assets live in the **repo** (same as Markdown). URLs are stable after deploy.

## Storage

| Type | Where to put files | URL in content |
|------|-------------------|----------------|
| Images | `apps/web-marketing/public/blog/media/` | `/blog/media/your-file.webp` |
| Cover (list + social) | Same folder, or leave empty for default | `coverImageUrl: /blog/media/hero.webp` — if empty, `/blog/default-og.png` is used |
| Self-hosted video | Same folder (`.mp4`, `.webm`, keep files reasonable size) | See below |
| YouTube / Vimeo | No upload — embed only | iframe in Markdown body |

## In Markdown body

**Image**

```markdown
![Diagram of approval flow](/blog/media/aegis-approval-flow.webp)
```

**Self-hosted video**

```html
<video src="/blog/media/demo-30s.mp4" controls playsinline preload="metadata"></video>
```

**YouTube** (use embed URL, not watch URL)

```html
<iframe
  title="Demo"
  src="https://www.youtube-nocookie.com/embed/VIDEO_ID"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
  allowfullscreen
></iframe>
```

**Vimeo**

```html
<iframe
  title="Demo"
  src="https://player.vimeo.com/video/VIDEO_ID"
  allow="autoplay; fullscreen; picture-in-picture"
  allowfullscreen
></iframe>
```

Raw HTML blocks are allowed for video/embeds only; other HTML is stripped by the sanitizer.

## Pages CMS uploads

When using [Pages CMS](https://pagescms.org) (see `docs/BLOG_PUBLISHING.md`), uploads go to the same `public/blog/media` folder and insert `/blog/media/...` paths automatically.

## Tips

- Prefer **webp** for photos; max width ~1600px before commit.
- Large video: host on YouTube/Vimeo and embed — keeps repo and deploys fast.
