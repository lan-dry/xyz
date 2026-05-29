/** Shared with Aegis Console — one theme preference across Salanor apps. */
export const OPS_THEME_KEY = "salanor.console.theme";

export type OpsTheme = "light" | "dark";

export function resolveOpsTheme(): OpsTheme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(OPS_THEME_KEY);
  if (stored === "dark" || stored === "light") return stored;
  if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
}

export function applyOpsTheme(theme: OpsTheme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function persistOpsTheme(theme: OpsTheme) {
  window.localStorage.setItem(OPS_THEME_KEY, theme);
  document.cookie = `${OPS_THEME_KEY}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function toggleOpsTheme(): OpsTheme {
  const next: OpsTheme = document.documentElement.classList.contains("dark")
    ? "light"
    : "dark";
  applyOpsTheme(next);
  persistOpsTheme(next);
  return next;
}
