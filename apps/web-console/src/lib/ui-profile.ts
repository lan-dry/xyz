/**
 * Console UI profile. `bank_demo` is the rehearsal / pitch profile:
 * trimmed nav, honest "Demo environment, synthetic data" strip, light theme,
 * Africa/Kigali times, RWF amounts. Set AEGIS_UI_PROFILE or
 * NEXT_PUBLIC_AEGIS_UI_PROFILE (next.config.ts inlines both for the browser).
 */

export type ConsoleUiProfile = "default" | "bank_demo";

export function consoleUiProfile(): ConsoleUiProfile {
  const raw = (process.env.NEXT_PUBLIC_AEGIS_UI_PROFILE ?? "").trim().toLowerCase();
  return raw === "bank_demo" ? "bank_demo" : "default";
}

export function isBankDemoProfile(): boolean {
  return consoleUiProfile() === "bank_demo";
}
