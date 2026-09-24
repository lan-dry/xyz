import sanitizeHtml from "sanitize-html";

const EMBED_HOST =
  /^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com|player\.vimeo\.com)\//;

function isAllowedIframeSrc(src: string | undefined): boolean {
  if (!src?.trim()) return false;
  return EMBED_HOST.test(src.trim());
}

export function sanitizeBlogHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "u",
      "s",
      "a",
      "ul",
      "ol",
      "li",
      "blockquote",
      "pre",
      "code",
      "h1",
      "h2",
      "h3",
      "h4",
      "hr",
      "img",
      "mark",
      "span",
      "figure",
      "figcaption",
      "video",
      "source",
      "iframe",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel", "title"],
      img: ["src", "alt", "title", "width", "height", "loading"],
      span: ["style"],
      p: ["style"],
      h1: ["id", "style"],
      h2: ["id", "style"],
      h3: ["id", "style"],
      h4: ["id", "style"],
      video: ["src", "controls", "poster", "preload", "playsinline"],
      source: ["src", "type"],
      iframe: ["src", "title", "allow", "allowfullscreen", "loading", "referrerpolicy"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      iframe: (tagName, attribs) => {
        if (!isAllowedIframeSrc(attribs.src)) {
          return { tagName: "div", attribs: {}, text: "" };
        }
        return {
          tagName,
          attribs: {
            ...attribs,
            loading: attribs.loading ?? "lazy",
            referrerpolicy: attribs.referrerpolicy ?? "strict-origin-when-cross-origin",
          },
        };
      },
      img: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          loading: attribs.loading ?? "lazy",
        },
      }),
    },
  });
}
