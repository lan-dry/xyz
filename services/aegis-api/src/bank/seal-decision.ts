/**
 * Seal a governed decision as an APS-1 event (D1 — one chain of truth).
 * Requires an active agent signing key for the organization.
 */
import { randomUUID } from "node:crypto";
import type { ApsEvent } from "@salanor/aegis";
import type pg from "pg";
import { signApsEventWithKey } from "../crypto/signing-provider.js";
import { persistSignedEvent } from "../ingest/persist.js";
import { getSigningKeyMaterial } from "../repo/signing-keys.js";
import type { BankOutcome } from "./outcome.js";
import { fromBankOutcome } from "./outcome.js";

export type SealDecisionInput = {
  organization_id: string;
  trace_id: string;
  case_id: string;
  decision_id: string;
  outcome: BankOutcome;
  mode: "enforce" | "record_only";
  would_have?: BankOutcome;
  product?: string;
  event_type?: string;
  tool_name: string;
  attributes: Record<string, unknown>;
  matched_rules: Array<{ rule_id: string; policy_id: string; decision: string }>;
  policy_id?: string | null;
  policy_version?: number | null;
  policy_content_hash?: string | null;
  agent_id?: string;
  key_id?: string;
  idempotency_key?: string;
};

export type SealDecisionResult = {
  event_id: string;
  event_hash: string;
  sequence_num: number;
};

async function lookupSignableAgentKey(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  preferredAgentId?: string | null,
): Promise<{ agent_id: string; key_id: string } | null> {
  // Prefer keys that can actually sign server-side (bridge ciphertext, KMS, or
  // local/dev). Preferred agent first; fall back to any org agent so a missing
  // preferred-agent key never forces provisional evt_gov_ citations.
  const result = await client.query<{ agent_id: string; key_id: string }>(
    `SELECT a.agent_id, sk.key_id
     FROM agent a
     JOIN signing_key sk
       ON sk.agent_id = a.agent_id
      AND sk.organization_id = a.organization_id
      AND sk.revoked = false
      AND sk.valid_from <= now()
      AND (sk.valid_until IS NULL OR sk.valid_until > now())
     WHERE a.organization_id = $1
       AND a.active = true
       AND ($2::text IS NULL OR a.agent_id = $2)
       AND (
         sk.private_key_ciphertext IS NOT NULL
         OR lower(COALESCE(sk.kms_provider, 'dev')) IN ('dev', 'aws', 'gcp', 'vault')
       )
     ORDER BY
       CASE WHEN $2::text IS NOT NULL AND a.agent_id = $2 THEN 0 ELSE 1 END,
       CASE WHEN sk.private_key_ciphertext IS NOT NULL THEN 0 ELSE 1 END,
       sk.valid_from DESC NULLS LAST
     LIMIT 1`,
    [organizationId, preferredAgentId ?? null],
  );
  return result.rows[0] ?? null;
}

async function resolveAgentKey(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  preferredAgentId?: string,
  preferredKeyId?: string,
): Promise<{ agent_id: string; key_id: string } | null> {
  if (preferredAgentId && preferredKeyId) {
    const preferred = await client.query<{ agent_id: string; key_id: string }>(
      `SELECT a.agent_id, sk.key_id
       FROM agent a
       JOIN signing_key sk
         ON sk.agent_id = a.agent_id
        AND sk.organization_id = a.organization_id
        AND sk.key_id = $3
        AND sk.revoked = false
       WHERE a.organization_id = $1
         AND a.agent_id = $2
         AND a.active = true
       LIMIT 1`,
      [organizationId, preferredAgentId, preferredKeyId],
    );
    if (preferred.rows[0]) return preferred.rows[0];
  }
  const forPreferred = preferredAgentId
    ? await lookupSignableAgentKey(client, organizationId, preferredAgentId)
    : null;
  if (forPreferred) return forPreferred;
  return lookupSignableAgentKey(client, organizationId, null);
}

export async function sealGovernedDecision(
  client: pg.PoolClient,
  input: SealDecisionInput,
): Promise<SealDecisionResult | null> {
  const resolved = await resolveAgentKey(
    client,
    input.organization_id,
    input.agent_id,
    input.key_id,
  );
  if (!resolved) return null;

  const keyMaterial = await getSigningKeyMaterial(
    client,
    input.organization_id,
    resolved.key_id,
  );
  if (!keyMaterial) return null;

  const policyDecision = fromBankOutcome(input.outcome);
  const event: ApsEvent = {
    schema_version: 1,
    event_id: `evt_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
    organization_id: input.organization_id,
    trace_id: input.trace_id,
    agent_id: resolved.agent_id,
    key_id: resolved.key_id,
    emitted_at: new Date().toISOString(),
    actor_type: "system",
    actor_principal: "aegis.governed.decide",
    action_kind: "policy_decision",
    policy_decision: policyDecision,
    policy_id: input.policy_id ?? undefined,
    tool_name: input.tool_name,
    payload: {
      case_id: input.case_id,
      decision_id: input.decision_id,
      outcome: input.outcome,
      mode: input.mode,
      ...(input.would_have ? { would_have: input.would_have } : {}),
      ...(input.product ? { product: input.product } : {}),
      ...(input.event_type ? { event_type: input.event_type } : {}),
      matched_rules: input.matched_rules,
      attributes: input.attributes,
      ...(input.policy_version != null
        ? { policy_version: input.policy_version }
        : {}),
      ...(input.policy_content_hash
        ? { policy_content_hash: input.policy_content_hash }
        : {}),
      investor_summary: `Governed decision ${input.outcome} for case ${input.case_id}`,
    },
  };

  const signed = await signApsEventWithKey(event, keyMaterial);
  const persisted = await persistSignedEvent(
    client,
    signed,
    input.idempotency_key
      ? `governed:${input.idempotency_key}`
      : undefined,
  );
  return {
    event_id: persisted.eventId,
    event_hash: persisted.eventHash,
    sequence_num: persisted.sequenceNum,
  };
}
