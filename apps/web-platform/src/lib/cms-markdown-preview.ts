/** Minimal preview for Ops read-only view (full render on www). */
export function markdownToSafeHtml(_markdown: string): string {
  return `<pre style="white-space:pre-wrap;font-size:0.8125rem">${escapeHtml(_markdown)}</pre>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
