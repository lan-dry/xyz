export type ActorType = "agent" | "human" | "system";

export type ActionKind =
  | "tool_call"
  | "llm_invocation"
  | "policy_decision"
  | "human_approval"
  | "result"
  | "provenance_claim"
  | "decision"
  | "data_access"
  | "span_start"
  | "span_end";

export type PolicyDecision =
  | "allow"
  | "deny"
  | "allow_with_obligation"
  | "allow_retro_audit";

/** APS-1 0.1 event envelope (pre-signature or with sig_* attached). */
export type ApsEvent = {
  schema_version: number;
  event_id: string;
  organization_id: string;
  trace_id: string;
  agent_id: string;
  key_id: string;
  emitted_at: string;
  actor_type: ActorType;
  actor_principal: string;
  action_kind: ActionKind;
  policy_decision: PolicyDecision;
  payload: Record<string, unknown>;
  span_id?: string;
  parent_span_id?: string;
  parent_event_id?: string;
  policy_id?: string;
  tool_name?: string;
  args_hash?: string;
  args_redacted?: Record<string, unknown>;
  result_status?: string;
  output_hash?: string;
  policy_obligations?: unknown;
  sig_alg?: string;
  sig_value_b64?: string;
};

export type SignOptions = {
  privateKeyB64: string;
  keyId: string;
};

export type SignAndIngestOptions = {
  apiBaseUrl: string;
  ingestApiKey: string;
  idempotencyKey?: string;
};
