/**
 * Recompute APS-1 signing digests for an organization's event chain and report validity.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { digestHex, verifyEventSignature } from "@salanor/aegis";

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
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const organizationId =
  process.env.DEMO_ORGANIZATION_ID ?? "11111111-1111-4111-8111-111111111111";

const pool = new pg.Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  const events = await client.query(
    `SELECT
       e.schema_version,
       e.event_id,
       e.organization_id,
       e.trace_id,
       e.parent_event_id,
       e.agent_id,
       e.key_id,
       e.policy_id,
       e.sequence_num,
       e.prev_event_hash,
       e.event_hash,
       e.actor_type,
       e.actor_principal,
       e.action_kind,
       e.tool_name,
       e.args_hash,
       e.args_redacted,
       e.policy_decision,
       e.policy_obligations,
       e.result_status,
       e.output_hash,
       e.sig_alg,
       e.sig_value_b64,
       e.chain_valid,
       e.payload,
       e.emitted_at,
       sk.public_key_b64
     FROM event e
     JOIN signing_key sk ON sk.key_id = e.key_id
     WHERE e.organization_id = $1
     ORDER BY e.agent_id, e.sequence_num ASC`,
    [organizationId],
  );

  let ok = true;
  const byAgent = new Map<string, typeof events.rows>();

  for (const row of events.rows) {
    const list = byAgent.get(row.agent_id) ?? [];
    list.push(row);
    byAgent.set(row.agent_id, list);
  }

  for (const [agentId, chain] of byAgent) {
    let prevHash: string | null = null;
    for (const row of chain) {
      const emittedAt =
        row.emitted_at instanceof Date
          ? row.emitted_at.toISOString()
          : String(row.emitted_at);

      const event: Record<string, unknown> = {
        schema_version: row.schema_version,
        event_id: row.event_id,
        organization_id: row.organization_id,
        trace_id: row.trace_id,
        agent_id: row.agent_id,
        key_id: row.key_id,
        emitted_at: emittedAt,
        actor_type: row.actor_type,
        actor_principal: row.actor_principal,
        action_kind: row.action_kind,
        policy_decision: row.policy_decision,
        payload: row.payload ?? {},
        sig_alg: row.sig_alg,
        sig_value_b64: row.sig_value_b64,
      };
      if (row.parent_event_id) event.parent_event_id = row.parent_event_id;
      if (row.policy_id) event.policy_id = row.policy_id;
      if (row.tool_name) event.tool_name = row.tool_name;
      if (row.args_hash) event.args_hash = row.args_hash;
      if (row.args_redacted) event.args_redacted = row.args_redacted;
      if (row.result_status) event.result_status = row.result_status;
      if (row.output_hash) event.output_hash = row.output_hash;
      if (row.policy_obligations) event.policy_obligations = row.policy_obligations;

      const expectedHash = digestHex(event, row.key_id);
      const sigOk = await verifyEventSignature(
        event as Parameters<typeof verifyEventSignature>[0],
        row.public_key_b64,
      );
      const prevOk =
        (prevHash === null && row.prev_event_hash === null) ||
        row.prev_event_hash === prevHash;
      const hashOk = row.event_hash === expectedHash;

      if (!sigOk || !prevOk || !hashOk || !row.chain_valid) {
        ok = false;
        console.error(
          `INVALID ${row.event_id} agent=${agentId} seq=${row.sequence_num} sig=${sigOk} prev=${prevOk} hash=${hashOk}`,
        );
      }

      prevHash = row.event_hash;
    }
  }

  console.log(
    JSON.stringify(
      {
        ok,
        organization_id: organizationId,
        event_count: events.rowCount,
      },
      null,
      2,
    ),
  );
  if (!ok) process.exit(1);
} finally {
  client.release();
  await pool.end();
}
