import { createHash, createHmac } from "node:crypto";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type PolicyManifest = {
  organization_id: string;
  policy_id: string;
  name: string;
  version: number;
  rules: Record<string, unknown>;
  rules_sha256: string;
  created_at: string;
  signature: {
    alg: "hmac-sha256";
    value: string;
  };
};

type ManifestPayload = Omit<PolicyManifest, "signature">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonValue(item));
  }
  if (isRecord(value)) {
    const out: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = normalizeJsonValue(value[key]);
    }
    return out;
  }
  return String(value);
}

export function canonicalizeJson(value: unknown): string {
  return JSON.stringify(normalizeJsonValue(value));
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function hmacSha256Hex(input: string, secret: string): string {
  return createHmac("sha256", secret).update(input, "utf8").digest("hex");
}

export function resolvePolicySigningKey(): string | null {
  const key = process.env.POLICY_SIGNING_KEY?.trim() || process.env.AUTH_SECRET?.trim() || "";
  return key.length > 0 ? key : null;
}

export function computeRulesSha256(rules: Record<string, unknown>): string {
  return sha256Hex(canonicalizeJson(rules));
}

function signManifestPayload(payload: ManifestPayload, signingKey: string): string {
  return hmacSha256Hex(canonicalizeJson(payload), signingKey);
}

export function createPolicyManifest(input: {
  organizationId: string;
  policyId: string;
  name: string;
  version: number;
  rules: Record<string, unknown>;
  createdAt: string | Date;
  signingKey: string;
}): PolicyManifest {
  const payload: ManifestPayload = {
    organization_id: input.organizationId,
    policy_id: input.policyId,
    name: input.name,
    version: input.version,
    rules: input.rules,
    rules_sha256: computeRulesSha256(input.rules),
    created_at: (input.createdAt instanceof Date ? input.createdAt : new Date(input.createdAt)).toISOString(),
  };
  const signature = signManifestPayload(payload, input.signingKey);
  return {
    ...payload,
    signature: {
      alg: "hmac-sha256",
      value: signature,
    },
  };
}

function parseManifest(input: unknown): { ok: true; manifest: PolicyManifest } | { ok: false; errors: string[] } {
  if (!isRecord(input)) {
    return { ok: false, errors: ["manifest must be an object"] };
  }
  const errors: string[] = [];
  const requiredStringFields = ["organization_id", "policy_id", "name", "created_at"] as const;
  for (const field of requiredStringFields) {
    if (typeof input[field] !== "string" || input[field].trim().length === 0) {
      errors.push(`${field} is required`);
    }
  }
  if (typeof input.version !== "number" || !Number.isInteger(input.version) || input.version <= 0) {
    errors.push("version must be a positive integer");
  }
  if (!isRecord(input.rules)) {
    errors.push("rules must be an object");
  }
  if (typeof input.rules_sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(input.rules_sha256)) {
    errors.push("rules_sha256 must be a sha256 hex string");
  }
  if (!isRecord(input.signature)) {
    errors.push("signature is required");
  } else {
    if (input.signature.alg !== "hmac-sha256") {
      errors.push("signature.alg must be hmac-sha256");
    }
    if (typeof input.signature.value !== "string" || !/^[0-9a-f]{64}$/i.test(input.signature.value)) {
      errors.push("signature.value must be a sha256 hmac hex string");
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, manifest: input as unknown as PolicyManifest };
}

export function verifyPolicyManifest(
  input: unknown,
  signingKey: string,
): { ok: true; manifest: PolicyManifest } | { ok: false; errors: string[] } {
  const parsed = parseManifest(input);
  if (!parsed.ok) {
    return parsed;
  }
  const { manifest } = parsed;
  const payload: ManifestPayload = {
    organization_id: manifest.organization_id,
    policy_id: manifest.policy_id,
    name: manifest.name,
    version: manifest.version,
    rules: manifest.rules,
    rules_sha256: manifest.rules_sha256,
    created_at: manifest.created_at,
  };
  const expectedRulesSha = computeRulesSha256(manifest.rules);
  const expectedSignature = signManifestPayload(payload, signingKey);
  const errors: string[] = [];
  if (expectedRulesSha !== manifest.rules_sha256) {
    errors.push("rules_sha256 does not match rules payload");
  }
  if (expectedSignature !== manifest.signature.value) {
    errors.push("signature verification failed");
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, manifest };
}
