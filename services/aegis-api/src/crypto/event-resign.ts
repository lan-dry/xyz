import { digestHex, signEvent, type ApsEvent } from "@salanor/aegis";
import type pg from "pg";
import { decryptBridgePrivateKey } from "./bridge-key-vault.js";

type EventResignRow = {
  schema_version: number;
  event_id: string;
  organization_id: string;
  trace_id: string;
  parent_event_id: string | null;
  agent_id: string;
  key_id: string;
  policy_id: string | null;
  actor_type: string;
  actor_principal: string;
  action_kind: string;
  tool_name: string | null;
  args_hash: string | null;
  args_redacted: unknown;
  policy_decision: string;
  policy_obligations: unknown;
  result_status: string | null;
  output_hash: string | null;
  sig_alg: string;
  payload: unknown;
  emitted_at: Date;
  private_key_ciphertext: string | null;
};

function rowToApsEvent(row: EventResignRow, payload: Record<string, unknown>): ApsEvent {
  const emittedAt =
    row.emitted_at instanceof Date
      ? row.emitted_at.toISOString()
      : String(row.emitted_at);

  const event: ApsEvent = {
    schema_version: row.schema_version,
    event_id: row.event_id,
    organization_id: row.organization_id,
    trace_id: row.trace_id,
    agent_id: row.agent_id,
    key_id: row.key_id,
    emitted_at: emittedAt,
    actor_type: row.actor_type as ApsEvent["actor_type"],
    actor_principal: row.actor_principal,
    action_kind: row.action_kind as ApsEvent["action_kind"],
    policy_decision: row.policy_decision as ApsEvent["policy_decision"],
    payload,
    sig_alg: row.sig_alg,
    sig_value_b64: "",
  };
  if (row.parent_event_id) event.parent_event_id = row.parent_event_id;
  if (row.policy_id) event.policy_id = row.policy_id;
  if (row.tool_name) event.tool_name = row.tool_name;
  if (row.args_hash) event.args_hash = row.args_hash;
  if (row.args_redacted && typeof row.args_redacted === "object") {
    event.args_redacted = row.args_redacted as Record<string, unknown>;
  }
  if (row.result_status) event.result_status = row.result_status;
  if (row.output_hash) event.output_hash = row.output_hash;
  if (row.policy_obligations && typeof row.policy_obligations === "object") {
    event.policy_obligations = row.policy_obligations as ApsEvent["policy_obligations"];
  }
  return event;
}

/** Merge payload fields and re-sign with the bridge key (server-held). */
export async function patchSignedEventPayload(
  client: pg.Pool | pg.PoolClient,
  params: {
    organizationId: string;
    eventId: string;
    patch: Record<string, unknown>;
  },
): Promise<boolean> {
  const result = await client.query<EventResignRow>(
    `SELECT
       e.schema_version,
       e.event_id,
       e.organization_id,
       e.trace_id,
       e.parent_event_id,
       e.agent_id,
       e.key_id,
       e.policy_id,
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
       e.payload,
       e.emitted_at,
       sk.private_key_ciphertext
     FROM event e
     JOIN signing_key sk ON sk.key_id = e.key_id AND sk.organization_id = e.organization_id
     WHERE e.organization_id = $1 AND e.event_id = $2
       AND sk.bridge_enabled = true
       AND sk.revoked = false
       AND sk.private_key_ciphertext IS NOT NULL`,
    [params.organizationId, params.eventId],
  );
  const row = result.rows[0];
  if (!row?.private_key_ciphertext) {
    return false;
  }

  const existing =
    row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : {};

  const merged = { ...existing, ...params.patch };
  const privateKeyB64 = decryptBridgePrivateKey(row.private_key_ciphertext);
  const unsigned = rowToApsEvent(row, merged);
  const signed = await signEvent(unsigned, {
    privateKeyB64,
    keyId: row.key_id,
  });
  const eventHash = digestHex(signed as unknown as Record<string, unknown>, row.key_id);

  await client.query(
    `UPDATE event
     SET payload = $1::jsonb,
         event_hash = $2,
         sig_value_b64 = $3
     WHERE organization_id = $4 AND event_id = $5`,
    [
      JSON.stringify(signed.payload),
      eventHash,
      signed.sig_value_b64,
      params.organizationId,
      params.eventId,
    ],
  );
  return true;
}
