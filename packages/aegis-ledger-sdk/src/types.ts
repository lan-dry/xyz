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
  | "anomaly_signal"
  | "span_start"
  | "span_end";

export type PolicyDecision =
  | "allow"
  | "deny"
  | "allow_with_obligation"
  | "allow_retro_audit";

/** APS-1 0.1 event envelope (matches `spec/aps/v0.1.json`). */
export interface ApsEvent {
  schema_version: 1;
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
}

export interface RecordInput {
  organization_id?: string;
  agent_id?: string;
  key_id?: string;
  actor_type?: ActorType;
  actor_principal?: string;
  action_kind?: ActionKind;
  policy_decision?: PolicyDecision;
  payload?: Record<string, unknown>;
  policy_id?: string;
  tool_name?: string;
  span_id?: string;
  parent_span_id?: string;
  /** When omitted, record() chains to the previous event_id in the store. */
  parent_event_id?: string | null;
  sig_alg?: string;
  sig_value_b64?: string;
}

export interface RecordOptions {
  /** Fixed clock for deterministic demos/tests (ISO-8601). */
  emitted_at?: string;
  /** @deprecated Prefer emitted_at. */
  recorded_at?: string;
  /** Override event id for deterministic demos/tests. */
  event_id?: string;
  /** Override trace id for deterministic demos/tests. */
  trace_id?: string;
}

export interface LocalStoreOptions {
  path: string;
}

export interface ReplayStep {
  event_id: string;
  action: string;
  subject: { type: string; id: string };
  tier: "A";
  reconstructed: {
    inputs: Record<string, unknown>;
    model?: Record<string, unknown>;
    policy?: Record<string, unknown>;
    outcome: Record<string, unknown>;
  };
}

export interface ReplayResult {
  trace_id: string;
  steps: ReplayStep[];
  digest: string;
}

export interface VerifyResult {
  ok: boolean;
  event_count: number;
  errors: string[];
}
