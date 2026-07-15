export class PolicyDeniedError extends Error {
  readonly toolName: string;

  constructor(toolName: string) {
    super(`Policy denied tool: ${toolName}`);
    this.name = "PolicyDeniedError";
    this.toolName = toolName;
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
