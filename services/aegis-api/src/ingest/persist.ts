import { digestHex } from "@salanor/aegis";
import type { ApsEvent } from "@salanor/aegis";
import type pg from "pg";
import { ensureSpanForEvent, resolveSpanId } from "./ensure-span.js";

export type PersistResult = {
  eventId: string;
  sequenceNum: number;
  eventHash: string;
  chainValid: boolean;
  replayed: boolean;
};

export async function findIdempotentEvent(
  client: pg.PoolClient,
  organizationId: string,
  idempotencyKey: string,
): Promise<string | null> {
  const result = await client.query<{ event_id: string }>(
    `SELECT event_id FROM idempotency_record
     WHERE organization_id = $1 AND idempotency_key = $2`,
    [organizationId, idempotencyKey],
  );
  return result.rows[0]?.event_id ?? null;
}

export async function persistSignedEvent(
  client: pg.PoolClient,
  event: ApsEvent,
  idempotencyKey: string | undefined,
): Promise<PersistResult> {
  if (idempotencyKey) {
    const existing = await findIdempotentEvent(
      client,
      event.organization_id,
      idempotencyKey,
    );
    if (existing) {
      const row = await client.query<{
        sequence_num: string;
        event_hash: string;
        chain_valid: boolean;
      }>(
        `SELECT sequence_num, event_hash, chain_valid FROM event WHERE event_id = $1`,
        [existing],
      );
      const hit = row.rows[0];
      return {
        eventId: existing,
        sequenceNum: Number(hit?.sequence_num ?? 0),
        eventHash: hit?.event_hash ?? "",
        chainValid: hit?.chain_valid ?? true,
        replayed: true,
      };
    }
  }

  const agentCheck = await client.query(
    `SELECT 1 FROM agent
     WHERE agent_id = $1 AND organization_id = $2 AND active = true`,
    [event.agent_id, event.organization_id],
  );
  if (agentCheck.rowCount === 0) {
    throw new Error("Unknown agent for organization");
  }

  const keyCheck = await client.query<{ public_key_b64: string }>(
    `SELECT public_key_b64 FROM signing_key
     WHERE key_id = $1 AND organization_id = $2 AND agent_id = $3
       AND revoked = false
       AND valid_from <= now()
       AND (valid_until IS NULL OR valid_until > now())`,
    [event.key_id, event.organization_id, event.agent_id],
  );
  if (keyCheck.rowCount === 0) {
    throw new Error("Unknown or inactive signing key");
  }

  const eventHash = digestHex(event as Record<string, unknown>, event.key_id);

  const chainRow = await client.query<{
    sequence_num: string;
    event_hash: string;
  }>(
    `SELECT sequence_num, event_hash FROM event
     WHERE organization_id = $1 AND agent_id = $2
     ORDER BY sequence_num DESC LIMIT 1`,
    [event.organization_id, event.agent_id],
  );

  const prev = chainRow.rows[0];
  const sequenceNum = prev ? Number(prev.sequence_num) + 1 : 1;
  const prevEventHash = prev?.event_hash ?? null;

  let chainValid = true;
  if (prev && prevEventHash) {
    chainValid = true;
  }

  await client.query(
    `INSERT INTO trace (trace_id, organization_id, agent_id, started_at, status)
     VALUES ($1, $2, $3, $4::timestamptz, 'running')
     ON CONFLICT (trace_id) DO NOTHING`,
    [event.trace_id, event.organization_id, event.agent_id, event.emitted_at],
  );

  const spanId = await ensureSpanForEvent(client, event);

  await client.query(
    `INSERT INTO event (
       event_id,
       organization_id,
       trace_id,
       span_id,
       parent_event_id,
       agent_id,
       key_id,
       policy_id,
       schema_version,
       sequence_num,
       prev_event_hash,
       event_hash,
       actor_type,
       actor_principal,
       action_kind,
       tool_name,
       args_hash,
       args_redacted,
       policy_decision,
       policy_obligations,
       result_status,
       output_hash,
       sig_alg,
       sig_value_b64,
       chain_valid,
       payload,
       emitted_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
       $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
       $22, $23, $24, $25, $26, $27::timestamptz
     )`,
    [
      event.event_id,
      event.organization_id,
      event.trace_id,
      spanId ?? resolveSpanId(event),
      event.parent_event_id ?? null,
      event.agent_id,
      event.key_id,
      event.policy_id && event.policy_id !== "none" ? event.policy_id : null,
      event.schema_version,
      sequenceNum,
      prevEventHash,
      eventHash,
      event.actor_type,
      event.actor_principal,
      event.action_kind,
      event.tool_name ?? null,
      event.args_hash ?? null,
      event.args_redacted ? JSON.stringify(event.args_redacted) : null,
      event.policy_decision,
      event.policy_obligations
        ? JSON.stringify(event.policy_obligations)
        : null,
      event.result_status ?? null,
      event.output_hash ?? null,
      event.sig_alg,
      event.sig_value_b64,
      chainValid,
      JSON.stringify(event.payload),
      event.emitted_at,
    ],
  );

  if (idempotencyKey) {
    await client.query(
      `INSERT INTO idempotency_record (organization_id, idempotency_key, event_id)
       VALUES ($1, $2, $3)`,
      [event.organization_id, idempotencyKey, event.event_id],
    );
  }

  await client.query(
    `UPDATE trace
     SET root_event_id = $1
     WHERE trace_id = $2
       AND organization_id = $3
       AND root_event_id IS NULL`,
    [event.event_id, event.trace_id, event.organization_id],
  );

  return {
    eventId: event.event_id,
    sequenceNum,
    eventHash,
    chainValid,
    replayed: false,
  };
}
