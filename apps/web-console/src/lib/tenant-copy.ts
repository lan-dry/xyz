"use client";

import { useQuery } from "@tanstack/react-query";
import { consoleApi } from "@/lib/api";

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

export type SandboxChecklistFlags = {
  create_api_key: boolean;
  send_first_event: boolean;
  see_sealed: boolean;
  approve_held: boolean;
  verify_bundle: boolean;
  invite_colleague: boolean;
};

export type SandboxStatus = {
  is_sandbox: boolean;
  banner: string | null;
  sandbox_expires_at: string | null;
  days_remaining: number | null;
  decision_mode?: {
    record_only_default: string;
    enforce_from_pack: string;
    applied_pack: { id: string; version: number | null; just_seeded: boolean } | null;
  };
  checklist: SandboxChecklistFlags;
  copy: TenantCopy;
};

export function checklistComplete(checklist: SandboxChecklistFlags): boolean {
  return (
    checklist.create_api_key &&
    checklist.send_first_event &&
    checklist.see_sealed &&
    checklist.approve_held &&
    checklist.verify_bundle &&
    checklist.invite_colleague
  );
}

/** Fallback when /sandbox/status has not loaded yet (real-tenant tone). */
const REAL: TenantCopy = {
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

export function useSandboxStatus() {
  return useQuery({
    queryKey: ["console", "sandbox", "status"],
    queryFn: () => consoleApi<SandboxStatus>("/sandbox/status"),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data?.is_sandbox) return false;
      return checklistComplete(data.checklist) ? false : 3_000;
    },
    refetchOnWindowFocus: true,
  });
}

export function useTenantCopy(): TenantCopy {
  const q = useSandboxStatus();
  return q.data?.copy ?? REAL;
}

/** Resolve empty-state CTA href from action label. */
export function emptyActionHref(action: string): string {
  switch (action) {
    case "Send a test event":
    case "Send a held scenario":
      return "/aegis/test-events";
    case "Open live feed":
      return "/aegis/live";
    case "View cases":
      return "/aegis/traces";
    case "Create an API key":
      return "/aegis/keys";
    case "Prepare an export":
      return "/aegis/exports";
    case "Invite a colleague":
      return "/aegis/settings/members";
    case "Open get started":
    default:
      return "/aegis/get-started";
  }
}
