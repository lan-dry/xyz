export type ApsVersion = "0.1";

export interface ApsActor {
  id: string;
  type: string;
}

export interface ApsSignature {
  alg: "ed25519" | "local-placeholder";
  value: string;
}

export interface ApsChain {
  prev_event_hash: string | null;
  event_hash: string;
}

export interface ApsEvent {
  aps_version: ApsVersion;
  event_id: string;
  recorded_at: string;
  tenant_id?: string;
  actor: ApsActor;
  action: string;
  subject: Record<string, unknown> & { type: string; id: string };
  context: Record<string, unknown> & {
    inputs: Record<string, unknown>;
    outcome: Record<string, unknown>;
  };
  signature: ApsSignature;
  chain: ApsChain;
}

export interface RecordInput {
  tenant_id?: string;
  actor: ApsActor;
  action: string;
  subject: ApsEvent["subject"];
  context: ApsEvent["context"];
  signature?: ApsSignature;
}

export interface RecordOptions {
  /** Fixed clock for deterministic demos/tests (ISO-8601). */
  recorded_at?: string;
  /** Override event id (uuid) for deterministic demos/tests. */
  event_id?: string;
}

export interface LocalStoreOptions {
  path: string;
}

export interface ReplayStep {
  event_id: string;
  action: string;
  subject: ApsEvent["subject"];
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
