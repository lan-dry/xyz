/**
 * Evidence grade for source provenance (Stage 1: only G1 exists).
 *
 * G1 = the business event arrived inside an AEGIS-SRC1 envelope whose Ed25519
 * signature verified against a key registered for that source, inside that
 * key's validity window. Stage 2 expands labelling (further grades and checks).
 */
import type { SignedEnvelope } from "@salanor/aegis-sdk";

export const SOURCE_SIGNED_GRADE = "G1" as const;
export type EvidenceGrade = typeof SOURCE_SIGNED_GRADE;

/** What the seal path needs to know about a verified source envelope. */
export type VerifiedSourceEnvelope = {
  envelope: SignedEnvelope;
  source_id: string;
  source_key_id: string;
};

/** Grade for a decision: G1 when a source signature was verified, otherwise none yet. */
export function gradeForDecision(input: {
  source_signed: boolean;
}): EvidenceGrade | null {
  return input.source_signed ? SOURCE_SIGNED_GRADE : null;
}

/**
 * Fields merged into the sealed event attributes and the forensic receipt
 * attributes. Kept minimal for Stage 1.
 *
 * When the org's field policy hid any attribute from the stored copy, the raw
 * `event` inside the envelope would leak it, so the event body is replaced by a
 * marker. The signature and event_hash stay, so the record still shows what was
 * signed and by whom.
 */
export function sourceProvenanceAttributes(
  verified: VerifiedSourceEnvelope,
  options: { eventContainsRedactedFields: boolean },
): Record<string, unknown> {
  const envelope: Record<string, unknown> = options.eventContainsRedactedFields
    ? { ...verified.envelope, event: { redacted_by_field_policy: true } }
    : { ...verified.envelope };
  return {
    source_envelope: envelope,
    source_id: verified.source_id,
    source_key_id: verified.source_key_id,
    evidence_grade: SOURCE_SIGNED_GRADE,
    checks: { source_signed: true },
    provenance: {
      authentication: "source_signature",
      grade: SOURCE_SIGNED_GRADE,
    },
  };
}
