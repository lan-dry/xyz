export function deriveThreadTitleFromMessage(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (!line) {
    return "New chat";
  }
  if (line.length <= 56) {
    return line;
  }
  return `${line.slice(0, 56).trimEnd()}…`;
}

export function isDefaultThreadTitle(title: string): boolean {
  const t = title.trim();
  return t === "" || t === "New chat";
}
