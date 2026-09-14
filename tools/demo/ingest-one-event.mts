/**
 * Stage 3 demo: sign one APS-1 event and ingest via aegis-api.
 *
 * Requires: docker compose up, pnpm db:migrate, pnpm db:seed, aegis-api dev
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { signAndIngest, type ApsEvent } from "@salanor/aegis";

function loadEnvFile(): void {
  const root = resolve(import.meta.dirname, "../..");
  for (const name of [".env.local", ".env"]) {
    const path = resolve(root, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq);
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnvFile();

const organizationId = "11111111-1111-4111-8111-111111111111";
const agentId = "agent-dev-01";
const keyId = "key-dev-01";
const ingestKey = process.env.AEGIS_INGEST_DEV_KEY ?? "aegis_dev_local_change_me";
const privateKeyB64 = process.env.DEV_SIGNING_PRIVATE_KEY_B64;
const apiBaseUrl = process.env.AEGIS_API_URL ?? "http://127.0.0.1:8080";

if (!privateKeyB64) {
  console.error("Set DEV_SIGNING_PRIVATE_KEY_B64 in .env (see .env.example)");
  process.exit(1);
}

const traceId = `trc_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
const eventId = `evt_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
const idempotencyKey =
  process.env.DEMO_IDEMPOTENCY_KEY ??
  `demo-${createHash("sha256").update(eventId).digest("hex").slice(0, 16)}`;

const event: ApsEvent = {
  schema_version: 1,
  event_id: eventId,
  organization_id: organizationId,
  trace_id: traceId,
  agent_id: agentId,
  key_id: keyId,
  emitted_at: new Date().toISOString(),
  actor_type: "agent",
  actor_principal: "dev-agent",
  action_kind: "tool_call",
  policy_decision: "allow",
  tool_name: "demo.echo",
  payload: { message: "Stage 3 ingest demo", idempotency_key: idempotencyKey },
};

const result = await signAndIngest(
  event,
  { privateKeyB64, keyId },
  { apiBaseUrl, ingestApiKey: ingestKey, idempotencyKey },
);

console.log(JSON.stringify({ ok: true, ...result, idempotency_key: idempotencyKey }, null, 2));
