export class PolicyDeniedError extends Error {
  readonly toolName: string;
  readonly detail?: string;

  constructor(toolName: string, detail?: string) {
    super(
      detail
        ? `Policy denied tool: ${toolName} — ${detail}`
        : `Policy denied tool: ${toolName}`,
    );
    this.name = "PolicyDeniedError";
    this.toolName = toolName;
    this.detail = detail;
  }
}

export class PolicyEvaluationUnavailableError extends Error {
  readonly toolName: string;
  readonly causeDetail: unknown;

  constructor(toolName: string, causeDetail?: unknown) {
    const detail =
      causeDetail instanceof Error ? ` (${causeDetail.message})` : "";
    super(`Policy evaluation unavailable; blocked tool: ${toolName}${detail}`);
    this.name = "PolicyEvaluationUnavailableError";
    this.toolName = toolName;
    this.causeDetail = causeDetail;
  }
}

export class ApprovalRequiredError extends Error {
  readonly toolName: string;
  readonly approvalId: string;
  readonly eventId: string;

  constructor(toolName: string, approvalId: string, eventId: string) {
    super(`Human approval required for ${toolName} (${approvalId})`);
    this.name = "ApprovalRequiredError";
    this.toolName = toolName;
    this.approvalId = approvalId;
    this.eventId = eventId;
  }
}
