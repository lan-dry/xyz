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
  /** Salanor employee — may open Platform Ops app (ops.salanor.com). */
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
  user: ConsoleUser;
  organization: ConsoleOrganization;
  organizations: ConsoleOrganization[];
  needs_onboarding?: boolean;
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
  valid_from: string;
  created_at: string;
};

export type AgentSummary = {
  agent_id: string;
  slug: string;
  display_name: string | null;
  did: string;
  active: boolean;
  created_at: string;
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
  status: string;
  started_at: string;
  ended_at: string | null;
  total_events: number;
  denied_events: number;
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
