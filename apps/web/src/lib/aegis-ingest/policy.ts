import type { ApsEvent } from "@salanor/aegis-ledger-sdk";

export type AegisPolicyRulesV1 = {
  version: "1";
  require_fields?: string[];
  deny_if_missing_actor?: boolean;
  max_payload_bytes?: number;
};

export type PolicyEvaluationResult = {
  allow: boolean;
  violations: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPath(value: unknown, dottedPath: string): unknown {
  const segments = dottedPath.split(".").filter(Boolean);
  let cursor: unknown = value;
  for (const segment of segments) {
    if (!isRecord(cursor) || !(segment in cursor)) {
      return undefined;
    }
    cursor = cursor[segment];
  }
  return cursor;
}

function byteLengthOfJson(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export function parsePolicyRules(input: unknown): AegisPolicyRulesV1 | null {
  if (!isRecord(input) || input.version !== "1") {
    return null;
  }

  const rules: AegisPolicyRulesV1 = { version: "1" };

  if ("require_fields" in input) {
    if (!Array.isArray(input.require_fields)) {
      return null;
    }
    const fields = input.require_fields.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    if (fields.length !== input.require_fields.length) {
      return null;
    }
    rules.require_fields = fields;
  }

  if ("deny_if_missing_actor" in input) {
    if (typeof input.deny_if_missing_actor !== "boolean") {
      return null;
    }
    rules.deny_if_missing_actor = input.deny_if_missing_actor;
  }

  if ("max_payload_bytes" in input) {
    if (
      typeof input.max_payload_bytes !== "number" ||
      !Number.isInteger(input.max_payload_bytes) ||
      input.max_payload_bytes <= 0
    ) {
      return null;
    }
    rules.max_payload_bytes = input.max_payload_bytes;
  }

  return rules;
}

export function evaluatePolicy(event: ApsEvent, rules: AegisPolicyRulesV1): PolicyEvaluationResult {
  const violations: string[] = [];

  if (rules.deny_if_missing_actor) {
    if (!event.actor?.id || !event.actor?.type) {
      violations.push("deny_if_missing_actor: actor.id and actor.type are required");
    }
  }

  if (rules.require_fields?.length) {
    for (const path of rules.require_fields) {
      const value = readPath(event, path);
      if (value === undefined || value === null || (typeof value === "string" && value.trim().length === 0)) {
        violations.push(`require_fields: missing ${path}`);
      }
    }
  }

  if (typeof rules.max_payload_bytes === "number") {
    const bytes = byteLengthOfJson(event);
    if (bytes > rules.max_payload_bytes) {
      violations.push(
        `max_payload_bytes: payload size ${bytes} exceeds limit ${rules.max_payload_bytes}`,
      );
    }
  }

  return {
    allow: violations.length === 0,
    violations,
  };
}

export const DEFAULT_POLICY_TEMPLATE: AegisPolicyRulesV1 = {
  version: "1",
  deny_if_missing_actor: true,
  require_fields: ["actor.id", "actor.type", "context.inputs", "context.outcome"],
  max_payload_bytes: 32768,
};
