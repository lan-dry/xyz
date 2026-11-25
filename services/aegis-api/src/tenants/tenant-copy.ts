/**
 * Plain-English console copy. Sandbox wording stays synthetic.
 * Optional organization.governance_settings.console_copy overrides string fields.
 */
export type TenantCopy = {
  home_empty_title: string;
  home_empty_body: string;
  home_empty_action: string;
  live_empty_title: string;
  live_empty_body: string;
  live_empty_action: string;
  cases_empty_title: string;
  cases_empty_body: string;
  cases_empty_action: string;
  approvals_empty_title: string;
  approvals_empty_body: string;
  approvals_empty_action: string;
  approvals_history_empty: string;
  keys_empty_title: string;
  keys_empty_body: string;
  keys_empty_action: string;
  exports_empty_title: string;
  exports_empty_body: string;
  exports_empty_action: string;
  members_empty_title: string;
  members_empty_body: string;
  members_empty_action: string;
  tooltip_live_feed: string;
  tooltip_approve: string;
  tooltip_reset: string;
  tooltip_test_event: string;
  tooltip_download_evidence: string;
  tooltip_invite: string;
};

export function defaultTenantCopy(isSandbox: boolean): TenantCopy {
  if (isSandbox) {
    return {
      home_empty_title: "Nothing here yet",
      home_empty_body:
        "This is where sealed cases show up after something happens. Send a test event to see one.",
      home_empty_action: "Send a test event",
      live_empty_title: "Live feed is empty",
      live_empty_body:
        "New sealed cases appear here as they arrive. This is not a chat — it is a record of what happened.",
      live_empty_action: "Send a test event",
      cases_empty_title: "No cases yet",
      cases_empty_body:
        "A case is a plain-language record of what happened, whether it was allowed, and a link to the receipt.",
      cases_empty_action: "Send a test event",
      approvals_empty_title: "Nothing waiting for you",
      approvals_empty_body:
        "When a rule needs a person, the case waits here. Try the Held test scenario, then come back.",
      approvals_empty_action: "Send a held scenario",
      approvals_history_empty:
        "Approved and declined decisions will show here with who decided and when.",
      keys_empty_title: "No API keys yet",
      keys_empty_body:
        "An API key lets your systems send events into this sandbox. You can also use Test sender without a key.",
      keys_empty_action: "Create an API key",
      exports_empty_title: "No evidence packs yet",
      exports_empty_body:
        "An evidence pack is a downloadable file of sealed receipts for auditors. Create one after you have a few cases.",
      exports_empty_action: "Prepare an export",
      members_empty_title: "Invite your first colleague",
      members_empty_body:
        "Bring in an Approver or Auditor by email. They set a password and land in this same sandbox.",
      members_empty_action: "Invite a colleague",
      tooltip_live_feed: "Shows sealed cases as they arrive.",
      tooltip_approve: "Records your decision on this held case.",
      tooltip_reset:
        "Clears synthetic cases and starts the 30-day clock again. Your login stays.",
      tooltip_test_event:
        "Sends one signed synthetic event. The signing key stays on the server.",
      tooltip_download_evidence:
        "Downloads the signed receipt file anyone can check offline.",
      tooltip_invite: "Sends an email invite with a role: Admin, Approver, or Auditor.",
    };
  }
  return {
    home_empty_title: "No cases yet",
    home_empty_body:
      "When a system records a governed action, a plain-language case appears here.",
    home_empty_action: "Open live feed",
    live_empty_title: "Live feed is empty",
    live_empty_body:
      "New sealed cases appear here as they arrive. This is a record of what happened — not a chat.",
    live_empty_action: "Open get started",
    cases_empty_title: "No cases yet",
    cases_empty_body:
      "A case is a plain-language record of what happened, whether it was allowed, and a link to the receipt.",
    cases_empty_action: "Open get started",
    approvals_empty_title: "Nothing waiting for you",
    approvals_empty_body:
      "When a rule asks for a person, the case waits here until someone approves or declines it.",
    approvals_empty_action: "View cases",
    approvals_history_empty:
      "Approved and declined decisions appear here with who decided and when.",
    keys_empty_title: "No API keys yet",
    keys_empty_body:
      "API keys let your systems send events into this organisation. Create one to connect a source.",
    keys_empty_action: "Create an API key",
    exports_empty_title: "No evidence packs yet",
    exports_empty_body:
      "An evidence pack is a downloadable file of sealed receipts for auditors.",
    exports_empty_action: "Prepare an export",
    members_empty_title: "Invite your first colleague",
    members_empty_body:
      "Invite people by email. They create an account when they accept — no prior login required.",
    members_empty_action: "Invite a colleague",
    tooltip_live_feed: "Shows sealed cases as they arrive.",
    tooltip_approve: "Records your decision on this held case.",
    tooltip_reset: "Reset is only available for a sandbox organisation.",
    tooltip_test_event: "Test events are only available in a sandbox.",
    tooltip_download_evidence:
      "Downloads the signed receipt file anyone can check offline.",
    tooltip_invite: "Sends an email invite with a role for this organisation.",
  };
}

export function mergeTenantCopy(
  isSandbox: boolean,
  override: unknown,
): TenantCopy {
  const base = defaultTenantCopy(isSandbox);
  if (!override || typeof override !== "object" || Array.isArray(override)) {
    return base;
  }
  const out = { ...base };
  for (const key of Object.keys(base) as Array<keyof TenantCopy>) {
    const value = (override as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) {
      out[key] = value.trim();
    }
  }
  return out;
}

export function sandboxDaysRemaining(
  expiresAt: Date | string | null | undefined,
  now = new Date(),
): number | null {
  if (!expiresAt) return null;
  const at = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(at.getTime())) return null;
  const ms = at.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}
