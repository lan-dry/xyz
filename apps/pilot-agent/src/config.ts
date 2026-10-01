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

function required(name: string, consoleHint: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    throw new Error(`Missing ${name} in .env — ${consoleHint}`);
  }
  return v;
}

export type PilotConfig = {
  apiBaseUrl: string;
  ingestApiKey: string;
  organizationId: string;
  organizationSlug: string;
  agentId: string;
  keyId: string;
  privateKeyB64: string;
  actorPrincipal: string;
  geminiApiKey: string;
  geminiModel: string;
};

/**
 * Credentials come from Aegis Console only (same names as examples/governance-bridge-node).
 */
export async function loadPilotConfig(): Promise<PilotConfig> {
  return {
    apiBaseUrl: process.env.AEGIS_API_URL?.trim() ?? "http://127.0.0.1:8080",
    ingestApiKey: required(
      "AEGIS_INGEST_API_KEY",
      "Console → API keys → Create key → copy the secret (shown once).",
    ),
    organizationId: required(
      "AEGIS_ORGANIZATION_ID",
      "Console → Settings → Organization → Organization ID.",
    ),
    organizationSlug:
      process.env.AEGIS_ORGANIZATION_SLUG?.trim() ??
      process.env.AEGIS_ORG_SLUG?.trim() ??
      "",
    agentId: required(
      "AEGIS_AGENT_ID",
      "Console → Agents → Create agent → copy agent_id from the credentials JSON.",
    ),
    keyId: required(
      "AEGIS_KEY_ID",
      "Console → Agents → Create agent → copy key_id from the credentials JSON.",
    ),
    privateKeyB64: required(
      "AEGIS_SIGNING_PRIVATE_KEY_B64",
      "Console → Agents → Create agent → copy private_key_b64 from the credentials JSON (shown once).",
    ),
    actorPrincipal:
      process.env.AEGIS_ACTOR_PRINCIPAL?.trim() ??
      process.env.PILOT_ACTOR_PRINCIPAL?.trim() ??
      "pilot-support-agent",
    geminiApiKey: process.env.GEMINI_API_KEY?.trim() ?? "",
    geminiModel: process.env.GEMINI_MODEL?.trim() ?? "gemini-2.0-flash",
  };
}
