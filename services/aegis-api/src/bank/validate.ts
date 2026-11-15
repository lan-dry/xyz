import type { BankEvent, BankValidationErrorBody } from "./types.js";

export class BankValidationError extends Error {
  readonly body: BankValidationErrorBody;
  readonly status = 400 as const;

  constructor(body: BankValidationErrorBody) {
    super(body.message);
    this.name = "BankValidationError";
    this.body = body;
  }
}

function fieldError(
  path: string,
  code: string,
  message: string,
): { path: string; code: string; message: string } {
  return { path, code, message };
}

export function parseBankEvent(body: unknown): BankEvent {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new BankValidationError({
      error: "validation_error",
      code: "body_not_object",
      message: "Body must be a JSON object",
    });
  }

  const raw = body as Record<string, unknown>;
  const fields: Array<{ path: string; code: string; message: string }> = [];

  if (raw.schema_version !== 1) {
    fields.push(
      fieldError("schema_version", "invalid", "schema_version must be 1"),
    );
  }
  if (typeof raw.case_id !== "string" || !raw.case_id.trim()) {
    fields.push(fieldError("case_id", "required", "case_id is required"));
  }
  if (typeof raw.idempotency_key !== "string" || !raw.idempotency_key.trim()) {
    fields.push(
      fieldError("idempotency_key", "required", "idempotency_key is required"),
    );
  }
  if (typeof raw.event_type !== "string" || !raw.event_type.trim()) {
    fields.push(fieldError("event_type", "required", "event_type is required"));
  }
  if (typeof raw.emitted_at !== "string" || !raw.emitted_at.trim()) {
    fields.push(fieldError("emitted_at", "required", "emitted_at is required"));
  } else {
    const t = Date.parse(raw.emitted_at);
    if (!Number.isFinite(t)) {
      fields.push(
        fieldError("emitted_at", "invalid", "emitted_at must be an ISO-8601 timestamp"),
      );
    }
  }
  if (
    !raw.attributes ||
    typeof raw.attributes !== "object" ||
    Array.isArray(raw.attributes)
  ) {
    fields.push(
      fieldError("attributes", "required", "attributes must be a JSON object"),
    );
  }

  if (fields.length > 0) {
    throw new BankValidationError({
      error: "validation_error",
      code: "malformed_bank_event",
      message: "Malformed bank event",
      fields,
    });
  }

  return {
    schema_version: 1,
    case_id: String(raw.case_id).trim(),
    idempotency_key: String(raw.idempotency_key).trim(),
    event_type: String(raw.event_type).trim(),
    product:
      typeof raw.product === "string" ? raw.product.trim() : undefined,
    workflow_id:
      typeof raw.workflow_id === "string" ? raw.workflow_id.trim() : undefined,
    agent_id: typeof raw.agent_id === "string" ? raw.agent_id.trim() : undefined,
    emitted_at: String(raw.emitted_at).trim(),
    actor:
      raw.actor && typeof raw.actor === "object" && !Array.isArray(raw.actor)
        ? (raw.actor as BankEvent["actor"])
        : undefined,
    attributes: raw.attributes as Record<string, unknown>,
    trace_id:
      typeof raw.trace_id === "string" ? raw.trace_id.trim() : undefined,
  };
}
