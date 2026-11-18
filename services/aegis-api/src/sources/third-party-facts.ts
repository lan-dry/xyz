/**
 * Stage 7: nested third-party signed facts (e.g. credit bureau response).
 *
 * The LOS forwards a bureau AEGIS-SRC1 envelope inside the event. Aegis verifies the
 * bureau signature against a registered `kind=third_party` key, uses the signed field
 * values for policy evaluation, and raises `fact_mismatch` when the LOS asserted a
 * different value. Nested verify does not advance the bureau's sequence (the envelope
 * is evidence, not a primary ingest).
 */
import {
  verifyEnvelope,
  type SignedEnvelope,
} from "@salanor/aegis-sdk";
import type pg from "pg";
import { getSource, getSourceKey } from "./registry.js";
import type { FieldAssertion } from "./provenance.js";

export type ThirdPartySignedField = {
  field: string;
  value: unknown;
  source_id: string;
  source_name: string;
  key_id: string;
  /** Human line for the case page, e.g. "Credit score 612, signed by Demo Credit Bureau". */
  display_line: string;
};

export type ThirdPartyFactResult = {
  /** Fields verified and taken from the third-party signature. */
  signed: ThirdPartySignedField[];
  /** Attribute overrides to apply before policy evaluation / sealing. */
  overrides: Record<string, unknown>;
  /** field → signed_by_third_party for provenance. */
  assertion_overrides: Record<string, FieldAssertion>;
  /** LOS value differed from the signed bureau value. */
  mismatches: Array<{
    field: string;
    asserted_value: unknown;
    signed_value: unknown;
    source_id: string;
    source_name: string;
    key_id: string;
  }>;
  /** Nested envelopes that failed crypto / registry checks (ignored for evaluation). */
  rejected: Array<{ reason: string; source_id?: string; key_id?: string }>;
  /** Sealed into receipt attributes for offline readers. */
  sealed: Array<{
    field: string;
    value: unknown;
    source_id: string;
    source_name: string;
    key_id: string;
    display_line: string;
    event_hash: string;
  }>;
};

const FIELD_LABELS: Record<string, string> = {
  credit_score: "Credit score",
  bureau_score: "Credit score",
  score: "Score",
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function looksLikeEnvelope(v: unknown): v is SignedEnvelope {
  return (
    isRecord(v) &&
    v.aegis_envelope === "1" &&
    typeof v.source_id === "string" &&
    typeof v.key_id === "string" &&
    typeof v.signature === "string" &&
    isRecord(v.event)
  );
}

/** Collect nested bureau envelopes from common attribute shapes. */
export function extractNestedEnvelopes(
  attributes: Record<string, unknown>,
): SignedEnvelope[] {
  const out: SignedEnvelope[] = [];
  const candidates: unknown[] = [];
  if (Array.isArray(attributes.third_party_facts)) {
    candidates.push(...attributes.third_party_facts);
  }
  if (Array.isArray(attributes.signed_facts)) {
    candidates.push(...attributes.signed_facts);
  }
  if (looksLikeEnvelope(attributes.bureau_response)) {
    candidates.push(attributes.bureau_response);
  } else if (isRecord(attributes.bureau_response) && looksLikeEnvelope(attributes.bureau_response.envelope)) {
    candidates.push(attributes.bureau_response.envelope);
  }
  for (const c of candidates) {
    if (looksLikeEnvelope(c)) out.push(c);
  }
  return out;
}

/** Pull signed business fields out of a bureau event payload. */
export function fieldsFromThirdPartyEvent(
  event: Record<string, unknown>,
): Record<string, unknown> {
  if (isRecord(event.fields)) {
    return { ...event.fields };
  }
  const out: Record<string, unknown> = {};
  for (const key of ["credit_score", "bureau_score", "score"]) {
    if (key in event && event[key] !== undefined) out[key] = event[key];
  }
  return out;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "string" && Number(b) === a) return true;
  if (typeof b === "number" && typeof a === "string" && Number(a) === b) return true;
  if (typeof a === "string" && typeof b === "string" && a.trim() === b.trim()) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function formatSignedFactLine(
  field: string,
  value: unknown,
  sourceName: string,
): string {
  const label = FIELD_LABELS[field] ?? field.replace(/_/g, " ");
  const shown =
    typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : JSON.stringify(value);
  const title = label.charAt(0).toUpperCase() + label.slice(1);
  return `${title} ${shown}, signed by ${sourceName}`;
}

/**
 * Verify nested third-party envelopes and reconcile LOS-asserted values with signed ones.
 */
export async function resolveThirdPartyFacts(
  db: pg.Pool | pg.PoolClient,
  organizationId: string,
  attributes: Record<string, unknown>,
  options?: { now?: Date },
): Promise<ThirdPartyFactResult> {
  const now = options?.now ?? new Date();
  const result: ThirdPartyFactResult = {
    signed: [],
    overrides: {},
    assertion_overrides: {},
    mismatches: [],
    rejected: [],
    sealed: [],
  };

  const envelopes = extractNestedEnvelopes(attributes);
  for (const envelope of envelopes) {
    const key = await getSourceKey(db, organizationId, envelope.key_id);
    if (!key) {
      result.rejected.push({
        reason: "unknown_key",
        source_id: envelope.source_id,
        key_id: envelope.key_id,
      });
      continue;
    }
    if (key.source_id !== envelope.source_id) {
      result.rejected.push({
        reason: "key_source_mismatch",
        source_id: envelope.source_id,
        key_id: envelope.key_id,
      });
      continue;
    }
    const source = await getSource(db, organizationId, envelope.source_id);
    if (!source) {
      result.rejected.push({
        reason: "unknown_source",
        source_id: envelope.source_id,
        key_id: envelope.key_id,
      });
      continue;
    }
    if (source.kind !== "third_party") {
      result.rejected.push({
        reason: "not_third_party",
        source_id: envelope.source_id,
        key_id: envelope.key_id,
      });
      continue;
    }
    if (source.status !== "active") {
      result.rejected.push({
        reason: "source_disabled",
        source_id: envelope.source_id,
        key_id: envelope.key_id,
      });
      continue;
    }
    if (key.status !== "active") {
      result.rejected.push({
        reason: key.status === "revoked" ? "key_revoked" : "key_inactive",
        source_id: envelope.source_id,
        key_id: envelope.key_id,
      });
      continue;
    }
    if (key.valid_from.getTime() > now.getTime()) {
      result.rejected.push({
        reason: "key_not_yet_valid",
        source_id: envelope.source_id,
        key_id: envelope.key_id,
      });
      continue;
    }
    if (key.valid_to && key.valid_to.getTime() < now.getTime()) {
      result.rejected.push({
        reason: "key_expired",
        source_id: envelope.source_id,
        key_id: envelope.key_id,
      });
      continue;
    }

    const verified = await verifyEnvelope(envelope, key.public_key_b64);
    if (!verified.ok) {
      result.rejected.push({
        reason: verified.reason,
        source_id: envelope.source_id,
        key_id: envelope.key_id,
      });
      continue;
    }

    const fields = fieldsFromThirdPartyEvent(envelope.event);
    for (const [field, signedValue] of Object.entries(fields)) {
      const asserted = attributes[field];
      if (asserted !== undefined && !valuesEqual(asserted, signedValue)) {
        result.mismatches.push({
          field,
          asserted_value: asserted,
          signed_value: signedValue,
          source_id: source.source_id,
          source_name: source.name,
          key_id: key.key_id,
        });
      }
      result.overrides[field] = signedValue;
      result.assertion_overrides[field] = "signed_by_third_party";
      const display_line = formatSignedFactLine(field, signedValue, source.name);
      const row: ThirdPartySignedField = {
        field,
        value: signedValue,
        source_id: source.source_id,
        source_name: source.name,
        key_id: key.key_id,
        display_line,
      };
      result.signed.push(row);
      result.sealed.push({
        ...row,
        event_hash: envelope.event_hash,
      });
    }
  }

  return result;
}

/** Apply signed overrides onto attribute maps used for evaluate / seal. */
export function applySignedOverrides(
  attributes: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  if (Object.keys(overrides).length === 0) return attributes;
  return { ...attributes, ...overrides };
}
