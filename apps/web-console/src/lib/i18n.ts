/**
 * Minimal i18n for Aegis console pages — loads locales/en.json.
 * Extend with additional locale files + navigator.language later.
 */
import en from "../locales/en.json";

type Dict = typeof en;

let active: Dict = en;

export function t(
  path: string,
  fallback?: string,
): string {
  const parts = path.split(".");
  let cur: unknown = active;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as object)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return fallback ?? path;
    }
  }
  return typeof cur === "string" ? cur : (fallback ?? path);
}

export function getMessages(): Dict {
  return active;
}

/** For tests / future locale switcher. */
export function setMessages(messages: Dict): void {
  active = messages;
}

export const messages = en;
