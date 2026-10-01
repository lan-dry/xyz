import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "a",
  "ul",
  "ol",
  "li",
  "blockquote",
  "h2",
  "h3",
  "hr",
] as const;

/** Markdown → HTML with inline styles for consistent rendering in email clients. */
export function markdownToNewsletterHtml(markdown: string): { html: string; text: string } {
  const raw = marked.parse(markdown, { async: false }) as string;
  const styled = styleNewsletterFragment(raw);
  const html = sanitizeHtml(styled, {
    allowedTags: [...ALLOWED_TAGS],
    allowedAttributes: {
      a: ["href", "title", "style"],
      h2: ["style"],
      h3: ["style"],
      p: ["style"],
      li: ["style"],
      blockquote: ["style"],
      ul: ["style"],
      ol: ["style"],
    },
    allowedSchemes: ["http", "https", "mailto"],
  });
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { html, text };
}

function styleNewsletterFragment(html: string): string {
  return html
    .replace(/<h2>/g, '<h2 style="margin:28px 0 12px;font-size:22px;font-weight:600;color:#f0f6fc;line-height:1.25;">')
    .replace(/<h3>/g, '<h3 style="margin:22px 0 10px;font-size:18px;font-weight:600;color:#f0f6fc;line-height:1.3;">')
    .replace(/<p>/g, '<p style="margin:0 0 16px;color:#c9d1d9;line-height:1.65;">')
    .replace(/<li>/g, '<li style="margin:0 0 8px;color:#c9d1d9;line-height:1.55;">')
    .replace(/<ul>/g, '<ul style="margin:0 0 16px;padding-left:22px;">')
    .replace(/<ol>/g, '<ol style="margin:0 0 16px;padding-left:22px;">')
    .replace(
      /<blockquote>/g,
      '<blockquote style="margin:20px 0;padding:12px 16px;border-left:3px solid #43c2a9;color:#e6edf3;">',
    )
    .replace(/<a /g, '<a style="color:#43c2a9;text-decoration:underline;" ');
}
