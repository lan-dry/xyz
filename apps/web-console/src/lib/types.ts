export type PlatformRole = "superadmin" | "admin" | "staff";

export type ConsoleUser = {
  user_id: string;
  organization_id: string;
  email: string;
  display_name: string | null;
  role: string;
};

export type ConsoleOrganization = {
  organization_id: string;
  name: string;
  slug: string;
  needs_onboarding?: boolean;
};

export type ConsoleAccount = {
  account_id: string;
  email: string;
  display_name: string | null;
  /** Salanor employee: may open Platform Ops app (ops.salanor.com). */
  platform_role?: PlatformRole | null;
  /** @deprecated use platform_role != null */
  platform_staff?: boolean;
  email_verified?: boolean;
};

export type ConsoleImpersonation = {
  active: true;
  organization_name: string;
  organization_slug: string;
  actor_account_id: string;
  actor_email: string;
  actor_platform_role: PlatformRole | null;
  started_at: string;
  effective_role: string;
};

export type MeResponse = {
  account: ConsoleAccount;
  user: ConsoleUser | null;
  organization: ConsoleOrganization | null;
  organizations: ConsoleOrganization[];
  needs_onboarding?: boolean;
  needs_organization?: boolean;
  code?: string;
  impersonation?: ConsoleImpersonation | null;
};

export type OrgMember = {
  membership_id: string;
  email: string;
  display_name: string | null;
  role: string;
  status: string;
  joined_at: string;
};

export type OrgInvitation = {
  invitation_id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  created_at: string;
  invited_by_email: string | null;
};

export type InvitePreview = {
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  email: string;
  role: string;
  expires_at: string;
};

export type AgentSigningKeySummary = {
  key_id: string;
  public_key_b64: string;
  kms_provider: string | null;
  revoked: boolean;
  bridge_enabled?: boolean;
  valid_from: string;
  created_at: string;
};

export type AgentSummary = {
  agent_id: string;
  slug: string;
  display_name: string | null;
  did: string;
  active: boolean;
  environment?: "production" | "sandbox" | string;
  created_at: string;
  /** True when a non-revoked Workflow Bridge signing key exists for this agent. */
  workflow_bridge_enabled?: boolean;
  signing_keys: AgentSigningKeySummary[];
};

export type AgentCredentialsPayload = {
  agent_id: string;
  key_id: string;
  organization_id: string;
  organization_slug: string;
  private_key_b64: string;
  public_key_b64: string;
};

export type TraceSummary = {
  trace_id: string;
  agent_id: string;
  /** Human-readable agent name; falls back to agent_id. */
  agent_name?: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  total_events: number;
  denied_events: number;
  pending_approval?: boolean;
  has_policy_decision?: boolean;
  needs_person?: boolean;
  preview_fields?: string[];
  preview_anomaly_reason?: string | null;
  preview_anomaly_type?: string | null;
  preview_subject?: string | null;
  root_event_id?: string | null;
  root_event_hash?: string | null;
  chain_root_hash?: string;
};

export type EventDetail = {
  event_id: string;
  trace_id: string;
  agent_id: string;
  action_kind: string;
  policy_decision: string;
  tool_name: string | null;
  sequence_num: number;
  event_hash: string;
  prev_event_hash: string | null;
  chain_valid: boolean;
  emitted_at: string;
  ingested_at: string;
  payload: unknown;
  payload_enriched?: Record<string, unknown>;
  span_id?: string | null;
  provenance_claim?: string;
  provenance_authority?: string;
};

export type EventSpanGroup = {
  span_id: string;
  label: string;
  events: EventDetail[];
};

export type SpanTreeNode = {
  span_id: string;
  parent_span_id: string | null;
  label: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  events: Array<{
    event_id: string;
    sequence_num: number;
    action_kind: string;
    policy_decision: string;
    tool_name: string | null;
    emitted_at: string;
  }>;
  child_spans: SpanTreeNode[];
};

export type IngestKeySummary = {
  key_id: string;
  name: string;
  key_prefix: string;
  active: boolean;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type CaseSealStatus =
  | "sealed"
  | "sealed_pending_witness"
  | "provisional"
  | "broken"
  | "unknown";

/** One approve/decline vote on a case. Email is for Technical details only. */
export type CaseApprover = {
  email: string | null;
  name?: string | null;
  /** Bank role key, e.g. credit_manager. */
  role?: string | null;
  decision: string;
  decided_at?: string | null;
  reason?: string | null;
  /** Set when this person decided under a time-limited delegation: who they acted for. */
  delegated_from_name?: string | null;
  delegated_from_email?: string | null;
};

/** GET /v1/console/cases/summary ? plain facts per case (Live feed, approvals). */
export type CaseSummary = {
  trace_id: string;
  case_id: string | null;
  outcome: string | null;
  mode: string | null;
  amount: number | null;
  currency: string | null;
  product: string | null;
  event_type: string | null;
  rules: string[];
  /** Rule that drove the outcome (the hold rule, not the AUTH-RL allow). */
  decided_by_rule_id?: string | null;
  approvers: CaseApprover[];
  approval_status: string | null;
  required_role: string | null;
  /** Screen label: "Patience Ingabire · Credit Officer". */
  requester: string | null;
  /** Technical / SoD match only. */
  requester_email?: string | null;
  requester_officer_id?: string | null;
  seal: CaseSealStatus;
  /** Where the data came from (Stage 2 honest labelling). Null when the case has no sealed receipt. */
  provenance?: CaseProvenance | null;
  demo_filler: boolean;
  /** Synthetic history from the demo seed (intake times staggered across prior weeks). */
  demo_history?: boolean;
  created_at: string | null;
};

export type EvidenceGradeId = "G0" | "G1" | "G2" | "G3";

export type FieldAssertionKind =
  | "asserted_by_source"
  | "derived_by_aegis"
  | "corroborated"
  | "independently_captured"
  | "signed_by_third_party";

/**
 * Mirrors aegis-api CaseProvenanceView. The grade says how the data was vouched for; it never
 * says the data is accurate. `record_line` is only shown when the record check passed.
 */
export type CaseProvenance = {
  legacy: boolean;
  source: {
    source_id: string;
    source_name: string;
    key_id: string | null;
    authentication: "bearer_key" | "source_signature" | "mtls";
  } | null;
  grade_at_seal: EvidenceGradeId;
  current_grade: EvidenceGradeId;
  grade_changes: Array<{
    receipt_id: string;
    at: string;
    from_grade: EvidenceGradeId;
    to_grade: EvidenceGradeId;
    reason: string;
    feed_name: string | null;
  }>;
  checklist: Array<{ id: string; label: string; met: boolean }>;
  field_assertions: Record<string, FieldAssertionKind>;
  /** Stage 7: e.g. "Credit score 612, signed by Demo Credit Bureau". */
  signed_facts?: Array<{
    field: string;
    value: unknown;
    source_id: string;
    source_name: string;
    key_id: string;
    display_line: string;
  }>;
  /** Stage 7: non-blocking plausibility flags. */
  plausibility_flags?: Array<{ kind: string; title: string }>;
  limitations: string;
  recorded_at: string | null;
  headline: string;
  record_line: string;
  source_line: string;
  source_line_short: string;
};

/** Signed-event source registry (GET /v1/console/sources). */
export type SourceKeySummary = {
  key_id: string;
  source_id: string;
  public_key_b64: string;
  /** First 8 + last 8 characters of the public key. */
  fingerprint: string;
  status: "active" | "rotated" | "revoked";
  valid_from: string | null;
  valid_to: string | null;
  created_by: string | null;
  revoked_by: string | null;
  reason: string | null;
  created_at: string | null;
};

export type SourceSummary = {
  source_id: string;
  name: string;
  kind: "application" | "executor" | "collector" | "third_party";
  owner_contact: string | null;
  status: "active" | "disabled";
  last_seq: number;
  last_event_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  active_key: SourceKeySummary | null;
  keys: SourceKeySummary[];
  open_gap_count: number;
};

export type SourceHistoryEvent = {
  id: string;
  action: "registered" | "key_added" | "key_rotated" | "key_revoked" | "source_disabled";
  key_id: string | null;
  actor: string | null;
  detail: Record<string, unknown>;
  created_at: string | null;
};

export type SourceHistory = {
  source: SourceSummary;
  events: SourceHistoryEvent[];
  gaps: Array<{ from_seq: number; to_seq: number; detected_at: string | null }>;
};
