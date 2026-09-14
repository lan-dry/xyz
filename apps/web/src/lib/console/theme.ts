export const CONSOLE_THEME_KEY = "aegis.console.theme";

export type ConsoleTheme = "light" | "dark";

export function readStoredConsoleTheme(): ConsoleTheme | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(CONSOLE_THEME_KEY);
  return stored === "dark" || stored === "light" ? stored : null;
}

export function resolveConsoleTheme(): ConsoleTheme {
  const stored = readStoredConsoleTheme();
  if (stored) return stored;
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function applyConsoleTheme(theme: ConsoleTheme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function persistConsoleTheme(theme: ConsoleTheme) {
  window.localStorage.setItem(CONSOLE_THEME_KEY, theme);
}

export function toggleConsoleTheme(): ConsoleTheme {
  const next: ConsoleTheme = document.documentElement.classList.contains("dark") ? "light" : "dark";
  applyConsoleTheme(next);
  persistConsoleTheme(next);
  return next;
}
