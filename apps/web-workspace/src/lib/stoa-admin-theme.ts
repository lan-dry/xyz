/** Same storage key as Aegis Console so theme follows across Salanor apps. */
export const STOA_THEME_KEY = "salanor.console.theme";

export type StoaThemePreference = "light" | "dark" | "system";

export type StoaAdminTheme = "light" | "dark";

export function readStoredThemePreference(): StoaThemePreference | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(STOA_THEME_KEY);
  if (stored === "dark" || stored === "light" || stored === "system") {
    return stored;
  }
  return null;
}

export function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function resolveTheme(): StoaAdminTheme {
  const stored = readStoredThemePreference();
  if (stored === "dark" || stored === "light") {
    return stored;
  }
  if (stored === "system" || stored === null) {
    return systemPrefersDark() ? "dark" : "light";
  }
  return "light";
}

export function applyTheme(theme: StoaAdminTheme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function persistThemePreference(preference: StoaThemePreference) {
  window.localStorage.setItem(STOA_THEME_KEY, preference);
  applyTheme(resolveTheme());
}

export function cycleThemePreference(): StoaThemePreference {
  const current = readStoredThemePreference() ?? "system";
  const next: StoaThemePreference =
    current === "light" ? "dark" : current === "dark" ? "system" : "light";
  persistThemePreference(next);
  return next;
}

export function themePreferenceLabel(
  preference: StoaThemePreference | null,
): string {
  if (preference === "system" || preference === null) {
    return "System";
  }
  return preference === "dark" ? "Dark" : "Light";
}

export const SIDEBAR_COLLAPSED_KEY = "stoa.admin.sidebar.collapsed";
