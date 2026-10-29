import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { normalizePostgresDatabaseUrl } from "@salanor/db-url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "../..");

// Root first so AEGIS_INGEST_DEV_KEY / DATABASE_URL win over stale apps/pilot-agent/.env Console pastes.
for (const path of [
  resolve(repoRoot, ".env.local"),
  resolve(repoRoot, ".env"),
  resolve(appRoot, ".env.local"),
  resolve(appRoot, ".env"),
]) {
  if (existsSync(path)) config({ path, override: false });
}

const FIXTURE_AGENT_ID = "agent-refund-operations";
const FIXTURE_KEY_ID = "key-refund-operations";
const FIXTURE_PAYOUT_AGENT_ID = "agent-payout-operations";
const FIXTURE_PAYOUT_KEY_ID = "key-payout-operations";
const DEFAULT_PILOT_SLUG = "northwind-payments";

export type PilotAgentKind = "refund" | "payout";

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

type OrgRow = { organization_id: string; slug: string };

/**
 * Local Northwind fixture from Postgres + AEGIS_INGEST_DEV_KEY / DEV_SIGNING_PRIVATE_KEY_B64.
 * Ignores stale AEGIS_ORGANIZATION_ID when that org no longer exists.
 */
async function resolveLocalFixtureConfig(
  agentKind: PilotAgentKind = "refund",
): Promise<PilotConfig | null> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const ingestApiKey =
    process.env.AEGIS_INGEST_DEV_KEY?.trim() || process.env.AEGIS_INGEST_API_KEY?.trim();
  const privateKeyB64 =
    process.env.DEV_SIGNING_PRIVATE_KEY_B64?.trim() ||
    process.env.AEGIS_SIGNING_PRIVATE_KEY_B64?.trim();
  if (!databaseUrl || !ingestApiKey || !privateKeyB64) {
    return null;
  }

  const pool = new pg.Pool({
    connectionString: normalizePostgresDatabaseUrl(databaseUrl),
    max: 1,
  });
  try {
    const envOrgId = process.env.AEGIS_ORGANIZATION_ID?.trim();
    let org: OrgRow | null = null;

    if (envOrgId) {
      const byId = await pool.query<OrgRow>(
        `SELECT organization_id, slug FROM organization WHERE organization_id = $1`,
        [envOrgId],
      );
      org = byId.rows[0] ?? null;
      if (!org) {
        console.warn(
          `Ignoring stale AEGIS_ORGANIZATION_ID=${envOrgId} (not in database); using local pilot fixture.`,
        );
      }
    }

    if (!org) {
      const slug =
        process.env.PILOT_ORGANIZATION_SLUG?.trim() ||
        process.env.AEGIS_ORGANIZATION_SLUG?.trim() ||
        process.env.AEGIS_ORG_SLUG?.trim() ||
        DEFAULT_PILOT_SLUG;
      const bySlug = await pool.query<OrgRow>(
        `SELECT organization_id, slug FROM organization WHERE slug = $1`,
        [slug],
      );
      org = bySlug.rows[0] ?? null;
      if (!org) {
        return null;
      }
    }

    const preferredAgentId =
      agentKind === "payout" ? FIXTURE_PAYOUT_AGENT_ID : FIXTURE_AGENT_ID;
    const preferredKeyId =
      agentKind === "payout" ? FIXTURE_PAYOUT_KEY_ID : FIXTURE_KEY_ID;

    const envAgentId =
      agentKind === "payout"
        ? process.env.AEGIS_PAYOUT_AGENT_ID?.trim() || process.env.AEGIS_AGENT_ID?.trim()
        : process.env.AEGIS_AGENT_ID?.trim();
    let agentId: string | null = null;
    if (envAgentId) {
      const agentCheck = await pool.query<{ agent_id: string }>(
        `SELECT agent_id FROM agent
         WHERE organization_id = $1 AND agent_id = $2 AND active = true`,
        [org.organization_id, envAgentId],
      );
      agentId = agentCheck.rows[0]?.agent_id ?? null;
      if (!agentId) {
        console.warn(
          `Ignoring agent id ${envAgentId} (not on org ${org.slug}); using fixture agent.`,
        );
      }
    }
    if (!agentId) {
      const fixture = await pool.query<{ agent_id: string }>(
        `SELECT agent_id FROM agent
         WHERE organization_id = $1 AND agent_id = $2 AND active = true`,
        [org.organization_id, preferredAgentId],
      );
      agentId = fixture.rows[0]?.agent_id ?? null;
    }
    if (!agentId) {
      const any = await pool.query<{ agent_id: string }>(
        `SELECT agent_id FROM agent
         WHERE organization_id = $1 AND active = true
         ORDER BY created_at ASC LIMIT 1`,
        [org.organization_id],
      );
      agentId = any.rows[0]?.agent_id ?? null;
    }
    if (!agentId) {
      return null;
    }

    const envKeyId =
      agentKind === "payout"
        ? process.env.AEGIS_PAYOUT_KEY_ID?.trim() || process.env.AEGIS_KEY_ID?.trim()
        : process.env.AEGIS_KEY_ID?.trim();
    let keyId: string | null = null;
    if (envKeyId) {
      const keyCheck = await pool.query<{ key_id: string }>(
        `SELECT key_id FROM signing_key
         WHERE organization_id = $1 AND agent_id = $2 AND key_id = $3 AND revoked = false`,
        [org.organization_id, agentId, envKeyId],
      );
      keyId = keyCheck.rows[0]?.key_id ?? null;
    }
    if (!keyId) {
      const fixtureKey = await pool.query<{ key_id: string }>(
        `SELECT key_id FROM signing_key
         WHERE organization_id = $1 AND agent_id = $2 AND key_id = $3 AND revoked = false`,
        [org.organization_id, agentId, preferredKeyId],
      );
      keyId = fixtureKey.rows[0]?.key_id ?? null;
    }
    if (!keyId) {
      const anyKey = await pool.query<{ key_id: string }>(
        `SELECT key_id FROM signing_key
         WHERE organization_id = $1 AND agent_id = $2 AND revoked = false
         ORDER BY valid_from DESC LIMIT 1`,
        [org.organization_id, agentId],
      );
      keyId = anyKey.rows[0]?.key_id ?? null;
    }
    if (!keyId) {
      return null;
    }

    // Always prefer the local fixture secret (must match applyPilotDemoData hash).
    const resolvedIngest =
      process.env.AEGIS_INGEST_DEV_KEY?.trim() ||
      ingestApiKey;
    const resolvedPrivate =
      process.env.DEV_SIGNING_PRIVATE_KEY_B64?.trim() || privateKeyB64;

    return {
      apiBaseUrl: process.env.AEGIS_API_URL?.trim() ?? "http://127.0.0.1:8080",
      ingestApiKey: resolvedIngest,
      organizationId: org.organization_id,
      organizationSlug: org.slug,
      agentId,
      keyId,
      privateKeyB64: resolvedPrivate,
      actorPrincipal:
        process.env.AEGIS_ACTOR_PRINCIPAL?.trim() ??
        process.env.PILOT_ACTOR_PRINCIPAL?.trim() ??
        (agentKind === "payout" ? "pilot-payout-agent" : "pilot-support-agent"),
      geminiApiKey: process.env.GEMINI_API_KEY?.trim() ?? "",
      geminiModel: process.env.GEMINI_MODEL?.trim() ?? "gemini-2.0-flash",
    };
  } finally {
    await pool.end();
  }
}

/**
 * Prefer local Northwind fixture from Postgres. Fall back to Console credentials in .env.
 */
export async function loadPilotConfig(
  agentKind: PilotAgentKind = "refund",
): Promise<PilotConfig> {
  const local = await resolveLocalFixtureConfig(agentKind);
  if (local) {
    return local;
  }

  return {
    apiBaseUrl: process.env.AEGIS_API_URL?.trim() ?? "http://127.0.0.1:8080",
    ingestApiKey: required(
      "AEGIS_INGEST_API_KEY",
      "Console → API keys → Create key → copy the secret (shown once). Or run pnpm db:local:pilot-fixture and set AEGIS_INGEST_DEV_KEY.",
    ),
    organizationId: required(
      "AEGIS_ORGANIZATION_ID",
      "Console → Settings → Organization → Organization ID. Or run pnpm db:local:pilot-fixture.",
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
