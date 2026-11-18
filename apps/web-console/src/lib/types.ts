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
  demo_filler: boolean;
  /** Synthetic back-dated history from the demo seed. */
  demo_history?: boolean;
  created_at: string | null;
};
