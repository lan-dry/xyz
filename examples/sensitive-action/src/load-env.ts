import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function unset(value: string | undefined): boolean {
  return !value?.trim();
}

/** Load .env from this package, then the repo root. Shell env wins. Empty values are ignored. */
export function loadEnvFile(): void {
  const here = resolve(import.meta.dirname, "..");
  const root = resolve(here, "../..");
  for (const dir of [here, root]) {
    for (const name of [".env.local", ".env"]) {
      const path = resolve(dir, name);
      if (!existsSync(path)) continue;
      let text = readFileSync(path, "utf8");
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!value) continue;
        if (unset(process.env[key])) process.env[key] = value;
      }
    }
  }

  if (unset(process.env.AEGIS_INGEST_API_KEY) && process.env.AEGIS_INGEST_DEV_KEY?.trim()) {
    process.env.AEGIS_INGEST_API_KEY = process.env.AEGIS_INGEST_DEV_KEY.trim();
  }
  if (
    unset(process.env.AEGIS_SIGNING_PRIVATE_KEY_B64) &&
    process.env.DEV_SIGNING_PRIVATE_KEY_B64?.trim()
  ) {
    process.env.AEGIS_SIGNING_PRIVATE_KEY_B64 =
      process.env.DEV_SIGNING_PRIVATE_KEY_B64.trim();
  }
}

export function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing ${name}.`);
    console.error(
      "Fill examples/sensitive-action/.env from the Aegis console (Agents + Settings → API keys).",
    );
    console.error(
      "For production use the live org/agent/key. For local, set AEGIS_API_URL=http://127.0.0.1:8080 and use a local agent.",
    );
    process.exit(1);
  }
  return value;
}
