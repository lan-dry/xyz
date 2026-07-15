import type { PilotConfig } from "./config.js";

async function pingHealth(apiBaseUrl: string): Promise<void> {
  const healthUrl = new URL("/health", apiBaseUrl).toString();
  const res = await fetch(healthUrl, {
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) {
    throw new Error(`health returned ${res.status}`);
  }
  const body = (await res.json()) as { status?: string; database?: string };
  if (body.database === "down") {
    throw new Error("database down (check Postgres: docker compose up -d)");
  }
}

/** Retry: SDK rebuild during `pilot:agent:rebuild` can briefly restart aegis-api under `pnpm dev`. */
export async function assertAegisApiReachable(config: PilotConfig): Promise<void> {
  const healthUrl = new URL("/health", config.apiBaseUrl).toString();
  const attempts = 5;
  let lastError: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      await pingHealth(config.apiBaseUrl);
      return;
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `Cannot reach Aegis API at ${config.apiBaseUrl} (${detail}).\n` +
      "The API must be listening on port 8080 before ingest:\n" +
      "  pnpm dev   (keep running)\n" +
      "  — or: pnpm --filter aegis-api dev\n" +
      `Check in browser: ${healthUrl}\n` +
      "If you see EADDRINUSE when starting dev, port 8080 is already in use — do not start a second API.\n" +
      "Use `pnpm pilot:agent` (not :rebuild) while dev is running to avoid restarting the API.",
  );
}
