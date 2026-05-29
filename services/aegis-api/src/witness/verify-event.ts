import {
  digestHex,
  verifyEventSignature,
  type ApsEvent,
} from "@salanor/aegis";
import { verifyMerkleProof } from "@salanor/witness-merkle";
import type pg from "pg";
import { getInclusionProofByEvent } from "../repo/witness.js";

export type EventRowForVerify = {
  schema_version: number;
  event_id: string;
  organization_id: string;
  trace_id: string;
  parent_event_id: string | null;
  agent_id: string;
  key_id: string;
  policy_id: string | null;
  sequence_num: string;
  prev_event_hash: string | null;
  event_hash: string;
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
  sig_value_b64: string;
  chain_valid: boolean;
  payload: unknown;
  emitted_at: Date;
  public_key_b64: string;
};

export type VerifyEventResult = {
  ok: boolean;
  chain_ok: boolean;
  inclusion_ok: boolean;
  signature_ok: boolean;
  hash_ok: boolean;
  prev_ok: boolean;
  has_proof: boolean;
  root_hash?: string;
  errors: string[];
};

function toApsEvent(row: EventRowForVerify): ApsEvent {
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
    payload: (row.payload ?? {}) as Record<string, unknown>,
    sig_alg: row.sig_alg,
    sig_value_b64: row.sig_value_b64,
  };
  if (row.parent_event_id) event.parent_event_id = row.parent_event_id;
  if (row.policy_id) event.policy_id = row.policy_id;
  if (row.tool_name) event.tool_name = row.tool_name;
  if (row.args_hash) event.args_hash = row.args_hash;
  if (row.args_redacted)
    event.args_redacted = row.args_redacted as Record<string, unknown>;
  if (row.result_status) event.result_status = row.result_status;
  if (row.output_hash) event.output_hash = row.output_hash;
  if (row.policy_obligations) event.policy_obligations = row.policy_obligations;
  return event;
}

export async function verifyEventChainLink(
  client: pg.Pool | pg.PoolClient,
  row: EventRowForVerify,
): Promise<{
  signature_ok: boolean;
  hash_ok: boolean;
  prev_ok: boolean;
}> {
  const event = toApsEvent(row);
  const expectedHash = digestHex(
    event as unknown as Record<string, unknown>,
    row.key_id,
  );
  const signature_ok = await verifyEventSignature(event, row.public_key_b64);
  const hash_ok = row.event_hash === expectedHash;

  const prevRow = await client.query<{ event_hash: string }>(
    `SELECT event_hash FROM event
     WHERE organization_id = $1 AND agent_id = $2 AND sequence_num = $3::bigint - 1`,
    [row.organization_id, row.agent_id, row.sequence_num],
  );
  const expectedPrev = prevRow.rows[0]?.event_hash ?? null;
  const prev_ok =
    (expectedPrev === undefined && row.prev_event_hash === null) ||
    row.prev_event_hash === expectedPrev;

  return { signature_ok, hash_ok, prev_ok };
}

export async function verifyEventFull(
  client: pg.Pool | pg.PoolClient,
  row: EventRowForVerify,
): Promise<VerifyEventResult> {
  const errors: string[] = [];
  const { signature_ok, hash_ok, prev_ok } = await verifyEventChainLink(
    client,
    row,
  );
  const chain_ok =
    signature_ok && hash_ok && prev_ok && row.chain_valid;

  if (!signature_ok) errors.push("signature_invalid");
  if (!hash_ok) errors.push("event_hash_mismatch");
  if (!prev_ok) errors.push("prev_hash_mismatch");
  if (!row.chain_valid) errors.push("chain_valid_flag_false");

  const proof = await getInclusionProofByEvent(
    client,
    row.organization_id,
    row.event_id,
  );

  let inclusion_ok = false;
  if (proof) {
    inclusion_ok = verifyMerkleProof(
      row.event_hash,
      proof.root_hash,
      proof.merkle_path,
    );
    if (!inclusion_ok) errors.push("inclusion_proof_invalid");
  } else {
    errors.push("no_inclusion_proof");
  }

  const ok = chain_ok && inclusion_ok;

  return {
    ok,
    chain_ok,
    inclusion_ok,
    signature_ok,
    hash_ok,
    prev_ok,
    has_proof: Boolean(proof),
    root_hash: proof?.root_hash,
    errors,
  };
}
