/** Client-side environment preference (Phase 3). Production is the default ledger. */

export type ConsoleEnvironment = "production" | "sandbox";

const STORAGE_KEY = "salanor.console.environment";

export function readConsoleEnvironment(): ConsoleEnvironment {
  if (typeof window === "undefined") return "production";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === "sandbox" ? "sandbox" : "production";
}

export function persistConsoleEnvironment(env: ConsoleEnvironment): void {
  window.localStorage.setItem(STORAGE_KEY, env);
}

export function environmentLabel(env: ConsoleEnvironment): string {
  return env === "sandbox" ? "Sandbox" : "Production";
}
