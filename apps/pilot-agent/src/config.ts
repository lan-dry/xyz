import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "../..");

for (const path of [
  resolve(appRoot, ".env.local"),
  resolve(appRoot, ".env"),
  resolve(repoRoot, ".env.local"),
  resolve(repoRoot, ".env"),
]) {
  if (existsSync(path)) config({ path });
}

function required(name: string, fallbackEnv?: string): string {
  const v =
    process.env[name]?.trim() ||
    (fallbackEnv ? process.env[fallbackEnv]?.trim() : undefined);
  if (!v) {
    throw new Error(
      `Missing ${name}${fallbackEnv ? ` (or ${fallbackEnv})` : ""} — see apps/pilot-agent/.env.example`,
    );
  }
  return v;
}

export const pilotConfig = {
  apiBaseUrl: process.env.AEGIS_API_URL?.trim() ?? "http://127.0.0.1:8080",
  ingestApiKey: required("AEGIS_INGEST_API_KEY", "AEGIS_INGEST_DEV_KEY"),
  organizationId: required("PILOT_ORGANIZATION_ID", "DEMO_ORGANIZATION_ID"),
  agentId: required("PILOT_AGENT_ID", "DEMO_AGENT_ID"),
  keyId: required("PILOT_KEY_ID", "DEMO_KEY_ID"),
  privateKeyB64: required(
    "PILOT_SIGNING_PRIVATE_KEY_B64",
    "DEV_SIGNING_PRIVATE_KEY_B64",
  ),
  actorPrincipal: process.env.PILOT_ACTOR_PRINCIPAL?.trim() ?? "pilot-support-agent",
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() ?? "",
  geminiModel: process.env.GEMINI_MODEL?.trim() ?? "gemini-2.0-flash",
};

export type PilotConfig = typeof pilotConfig;
