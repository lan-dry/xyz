/**
 * Verify APS-1 chain link + Merkle inclusion proof for one event.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

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

const databaseUrl = process.env.DATABASE_URL;
const eventId = process.argv[2];
if (!databaseUrl || !eventId) {
  console.error("Usage: verify-inclusion.mts <event_id>");
  process.exit(1);
}

const { verifyEventFull } = await import(
  "../../services/aegis-api/src/witness/verify-event.js"
);

const organizationId =
  process.env.DEMO_ORGANIZATION_ID ?? "11111111-1111-4111-8111-111111111111";

const pool = new pg.Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  const result = await client.query(
    `SELECT
       e.schema_version, e.event_id, e.organization_id, e.trace_id, e.parent_event_id,
       e.agent_id, e.key_id, e.policy_id, e.sequence_num, e.prev_event_hash, e.event_hash,
       e.actor_type, e.actor_principal, e.action_kind, e.tool_name, e.args_hash,
       e.args_redacted, e.policy_decision, e.policy_obligations, e.result_status,
       e.output_hash, e.sig_alg, e.sig_value_b64, e.chain_valid, e.payload, e.emitted_at,
       sk.public_key_b64
     FROM event e
     JOIN signing_key sk ON sk.key_id = e.key_id
     WHERE e.organization_id = $1 AND e.event_id = $2`,
    [organizationId, eventId],
  );
  const row = result.rows[0];
  if (!row) {
    console.error("Event not found");
    process.exit(1);
  }

  const verification = await verifyEventFull(client, row);
  console.log(JSON.stringify({ event_id: eventId, verification }, null, 2));
  if (!verification.ok) process.exit(1);
} finally {
  client.release();
  await pool.end();
}
