import type { ApsEvent } from "@salanor/aegis";

const ACTOR_TYPES = new Set(["agent", "human", "system"]);
const ACTION_KINDS = new Set([
  "tool_call",
  "llm_invocation",
  "policy_decision",
  "human_approval",
  "result",
  "provenance_claim",
  "decision",
  "data_access",
  "anomaly_signal",
]);
const POLICY_DECISIONS = new Set([
  "allow",
  "deny",
  "allow_with_obligation",
  "allow_retro_audit",
]);

const REQUIRED = [
  "schema_version",
  "event_id",
  "organization_id",
  "trace_id",
  "agent_id",
  "key_id",
  "emitted_at",
  "actor_type",
  "actor_principal",
  "action_kind",
  "policy_decision",
  "payload",
  "sig_alg",
  "sig_value_b64",
] as const;

const MAX_CLOCK_SKEW_MS = 15 * 60 * 1000;

export class IngestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestValidationError";
  }
}

export function parseApsEvent(body: unknown): ApsEvent {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new IngestValidationError("Body must be a JSON object");
  }
  const event = body as Record<string, unknown>;
  for (const field of REQUIRED) {
    if (event[field] === undefined || event[field] === null) {
      throw new IngestValidationError(`Missing required field: ${field}`);
    }
  }
  if (event.schema_version !== 1) {
    throw new IngestValidationError("schema_version must be 1");
  }
  if (event.sig_alg !== "ed25519") {
    throw new IngestValidationError("sig_alg must be ed25519");
  }
  if (!ACTOR_TYPES.has(event.actor_type as string)) {
    throw new IngestValidationError("Invalid actor_type");
  }
  if (!ACTION_KINDS.has(event.action_kind as string)) {
    throw new IngestValidationError("Invalid action_kind");
  }
  if (!POLICY_DECISIONS.has(event.policy_decision as string)) {
    throw new IngestValidationError("Invalid policy_decision");
  }
  if (typeof event.payload !== "object" || event.payload === null) {
    throw new IngestValidationError("payload must be an object");
  }

  assertActionPayload(
    event.action_kind as string,
    event.payload as Record<string, unknown>,
  );

  const emittedAt = new Date(event.emitted_at as string);
  if (Number.isNaN(emittedAt.getTime())) {
    throw new IngestValidationError("emitted_at must be RFC 3339");
  }
  const skew = Math.abs(Date.now() - emittedAt.getTime());
  if (skew > MAX_CLOCK_SKEW_MS) {
    throw new IngestValidationError("emitted_at outside allowed clock skew");
  }

  return event as ApsEvent;
}

export function assertOrganizationMatch(
  event: ApsEvent,
  organizationId: string,
): void {
  if (event.organization_id !== organizationId) {
    throw new IngestValidationError(
      "organization_id does not match ingest API key scope",
    );
  }
}

const SENSITIVITY = new Set(["low", "medium", "high"]);

/** Soft shape checks for newer APS kinds (does not reject unknown extra fields). */
function assertActionPayload(
  actionKind: string,
  payload: Record<string, unknown>,
): void {
  if (actionKind === "data_access") {
    if (typeof payload.resource !== "string" || !payload.resource.trim()) {
      throw new IngestValidationError(
        "data_access payload.resource must be a non-empty string",
      );
    }
    const fields = payload.fields_accessed ?? payload.fields ?? payload.data_touched;
    if (fields !== undefined && !Array.isArray(fields)) {
      throw new IngestValidationError(
        "data_access payload.fields_accessed must be an array of strings",
      );
    }
    if (
      payload.sensitivity !== undefined &&
      (typeof payload.sensitivity !== "string" ||
        !SENSITIVITY.has(payload.sensitivity))
    ) {
      throw new IngestValidationError(
        "data_access payload.sensitivity must be low, medium, or high",
      );
    }
    if (
      payload.volume_bytes !== undefined &&
      (typeof payload.volume_bytes !== "number" ||
        !Number.isFinite(payload.volume_bytes))
    ) {
      throw new IngestValidationError(
        "data_access payload.volume_bytes must be a number",
      );
    }
  }

  if (actionKind === "anomaly_signal") {
    if (typeof payload.type !== "string" || !payload.type.trim()) {
      throw new IngestValidationError(
        "anomaly_signal payload.type must be a non-empty string",
      );
    }
    if (typeof payload.reason !== "string" || !payload.reason.trim()) {
      throw new IngestValidationError(
        "anomaly_signal payload.reason must be a non-empty string",
      );
    }
    if (
      typeof payload.severity !== "string" ||
      !SENSITIVITY.has(payload.severity)
    ) {
      throw new IngestValidationError(
        "anomaly_signal payload.severity must be low, medium, or high",
      );
    }
  }
}
