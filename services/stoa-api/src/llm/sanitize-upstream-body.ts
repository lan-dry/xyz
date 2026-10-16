export function looksLikeHtmlBody(body: string): boolean {
  const sample = body.trim().slice(0, 512).toLowerCase();
  return (
    sample.startsWith("<!doctype") ||
    sample.startsWith("<html") ||
    (sample.includes("<head") && sample.includes("<body"))
  );
}

export function humanizeUpstreamBody(body: string, status: number): string | null {
  if (!looksLikeHtmlBody(body)) {
    return null;
  }
  return (
    `Upstream returned a web page (HTTP ${status}), not an API. ` +
    `Use your vendor’s OpenAI-compatible API base URL (e.g. https://api.openai.com), ` +
    `not a browser or marketing site.`
  );
}
