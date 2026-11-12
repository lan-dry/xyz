import type { SensitiveAction } from "./types.js";

function humanField(raw: string): string {
  return raw.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
}

function statusLabel(action: SensitiveAction): string {
  if (action.approval?.decision === "approved") return "Approved";
  if (action.approval?.decision === "rejected") return "Declined";
  if (action.outcome === "blocked") return "Stopped";
  if (action.outcome === "paused") return "Needs approval";
  return "Completed";
}

/**
 * Plain-language receipt a non-technical reader can follow.
 * Same story the console shows after the case is sealed.
 */
export function buildReceiptStory(action: SensitiveAction): {
  headline: string;
  status: string;
  whatHappened: string;
  dataSeen: string[];
  policy: string;
  approval: string;
} {
  const fields = action.fields_accessed.map(humanField).filter(Boolean);
  const status = statusLabel(action);

  let approval = "No person was asked.";
  if (action.approval?.required) {
    if (action.approval.decision === "approved") {
      approval = `Approved by ${action.approval.approver ?? "a person"}.`;
    } else if (action.approval.decision === "rejected") {
      approval = `Declined by ${action.approval.approver ?? "a person"}.`;
    } else {
      approval = "Waiting for a person to decide.";
    }
  }

  return {
    headline: action.summary,
    status,
    whatHappened: action.action,
    dataSeen: fields,
    policy: action.policy.reason,
    approval,
  };
}

export function formatReceiptStory(action: SensitiveAction): string {
  const story = buildReceiptStory(action);
  const lines = [
    story.headline,
    "",
    `Status: ${story.status}`,
    "",
    "What happened",
    story.whatHappened,
    "",
    "What data was seen",
    ...(story.dataSeen.length > 0
      ? story.dataSeen.map((f) => `  · ${f}`)
      : ["  · (none recorded)"]),
    "",
    "Policy decision",
    story.policy,
    "",
    "Approval",
    story.approval,
  ];
  return lines.join("\n");
}
