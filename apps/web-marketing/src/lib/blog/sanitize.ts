import sanitizeHtml from "sanitize-html";

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
    ],
    allowedAttributes: {
      a: ["href", "target", "rel", "title"],
      img: ["src", "alt", "title"],
      span: ["style"],
      p: ["style"],
      h1: ["id", "style"],
      h2: ["id", "style"],
      h3: ["id", "style"],
      h4: ["id", "style"],
    },
    allowedSchemes: ["http", "https", "mailto"],
  });
}
