const MEDIA_PATH_RE = /\/blog\/media\/[A-Za-z0-9._-]+/g;

/** Collect public paths like `/blog/media/foo.webp` from Markdown, HTML, or plain URLs. */
export function extractBlogMediaPaths(...texts: (string | null | undefined)[]): Set<string> {
  const out = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(MEDIA_PATH_RE)) {
      out.add(match[0]);
    }
  }
  return out;
}

export function blogMediaFilenameFromPublicPath(publicPath: string): string | null {
  const trimmed = publicPath.trim();
  const match = trimmed.match(/^\/blog\/media\/(.+)$/);
  if (!match?.[1] || match[1].includes("..")) return null;
  return match[1];
}
