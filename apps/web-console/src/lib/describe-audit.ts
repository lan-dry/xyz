/**
 * Plain-language sentences for access-log (audit_log) rows in the bank profile.
 * "Who did what to which case", never the raw action code.
 */

export type AuditRowLike = {
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  actor_email: string | null;
};

function str(meta: Record<string, unknown> | null, key: string): string | null {
  const v = meta?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(meta: Record<string, unknown> | null, key: string): number | null {
  const v = meta?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Case id (e.g. CASE-1042) when the entry is about a case. */
export function auditCaseId(row: AuditRowLike): string | null {
  const fromMeta = str(row.metadata, "case_id");
  if (fromMeta) return fromMeta;
  return row.resource_type === "case" ? row.resource_id : null;
}

export function auditTraceId(row: AuditRowLike): string | null {
  return str(row.metadata, "trace_id");
}

function humanize(action: string): string {
  const s = action.replace(/[._]+/g, " ").trim();
  return s ? s[0]!.toUpperCase() + s.slice(1) : action;
}

/** Filter labels for the Action select and the quick chips. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "receipt.viewed": "Receipt opened",
  "receipt.verified": "Receipt verified",
  "evidence.downloaded": "Evidence downloaded",
  "field.revealed": "Masked field revealed",
  "receipt.share_created": "Share link created",
  "receipt.share_opened": "Share link opened",
  "receipt.share_revoked": "Share link revoked",
  "auth.login.success": "Signed in",
  "policy.created": "Rules drafted",
  "policy.activation_requested": "Rules activation requested",
  "policy.activated": "Rules activated",
  "policy.archived": "Rules retired",
  "policy.updated": "Rules draft edited",
  "policy.deleted": "Rules draft deleted",
  "approval.approved": "Approved",
  "approval.rejected": "Declined",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? humanize(action);
}

/** One sentence: "alice@bank.rw opened the receipt for case CASE-1042." */
export function describeAuditEntry(row: AuditRowLike): string {
  const who = row.actor_email ?? "Someone";
  const caseId = auditCaseId(row);
  const ofCase = caseId ? ` for case ${caseId}` : "";
  const m = row.metadata;
  const ver = num(m, "version");
  const rules = ver !== null ? `rules v${ver}` : "a rule version";

  switch (row.action) {
    case "receipt.viewed":
      return `${who} opened the receipt${ofCase}.`;
    case "receipt.verified":
      return `${who} checked the receipt signature${ofCase}.`;
    case "evidence.downloaded": {
      const fmt = str(m, "format");
      const kind = fmt === "pdf" ? "the evidence PDF" : "the evidence bundle";
      return `${who} downloaded ${kind}${ofCase}.`;
    }
    case "receipt.share_created":
      return `${who} created a share link${ofCase}.`;
    case "receipt.share_opened":
      return `${row.actor_email ?? "Someone with the link"} opened a shared receipt${ofCase}.`;
    case "receipt.share_revoked":
      return `${who} revoked a share link${ofCase}.`;
    case "auth.login.success":
      return `${who} signed in.`;
    case "policy.created":
      return `${who} drafted ${rules}.`;
    case "policy.updated":
      return `${who} edited the draft of ${rules}.`;
    case "policy.deleted":
      return `${who} deleted a draft of the rules.`;
    case "policy.activation_requested":
      return `${who} approved activating a rule version. A second approver is still needed.`;
    case "policy.activated":
      return `${who} activated ${rules}.`;
    case "policy.archived":
      return `${who} retired ${rules}.`;
    case "approval.approved":
      return `${who} approved a held case${ofCase}.`;
    case "approval.rejected":
      return `${who} declined a held case${ofCase}.`;
    case "approval.ask_more":
      return `${who} asked for more information${ofCase}.`;
    case "approval.escalated_to_role":
      return `${who} escalated a held case to a higher role${ofCase}.`;
    case "approval.reassigned":
      return `${who} reassigned a held case${ofCase}.`;
    case "approval.hard_stop_released":
      return `${who} released a stopped case${ofCase}.`;
    case "approval.guard_denied":
      return `${who} tried to decide a case without the required authority${ofCase}.`;
    case "ingest_key.created":
      return `${who} created an access key.`;
    case "ingest_key.revoked":
      return `${who} revoked an access key.`;
    case "ingest_key.renamed":
      return `${who} renamed an access key.`;
    case "compliance.export.created":
      return `${who} created a report export.`;
    case "compliance.export.downloaded":
      return `${who} downloaded a report export.`;
    default:
      return `${who}: ${humanize(row.action).toLowerCase()}.`;
  }
}

/** Entries that are not about cases or rules and are noise for a bank reviewer. */
export const BANK_HIDDEN_ACTIONS = new Set([
  "membership.suspended",
  "membership.reactivated",
  "membership.role_changed",
  "invitation.created",
  "invitation.accepted",
]);
