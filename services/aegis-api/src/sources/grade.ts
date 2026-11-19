/**
 * Evidence grade for source provenance.
 *
 *   G0  asserted: the sender used an ingest key (bearer) and nothing else vouches for the data.
 *   G1  source-signed: the event arrived inside an AEGIS-SRC1 envelope whose Ed25519 signature
 *       verified against a key registered for that source, inside that key's validity window.
 *   G2  corroborated: a second record agrees (execution matched or reconciled). Stage 3+.
 *   G3  independently captured: Aegis, or a party the source does not control, saw it directly.
 *       Stage 4+.
 *
 * A grade says where the data came from. It never says the data is accurate.
 * Stage 2 labels grades on every receipt; Stage 1 only produced G1.
 */
import type { SignedEnvelope } from "@salanor/aegis-sdk";

export const SOURCE_SIGNED_GRADE = "G1" as const;
export const EVIDENCE_GRADES = ["G0", "G1", "G2", "G3"] as const;
export type EvidenceGrade = (typeof EVIDENCE_GRADES)[number];

/** What the seal path needs to know about a verified source envelope. */
export type VerifiedSourceEnvelope = {
  envelope: SignedEnvelope;
  source_id: string;
  source_key_id: string;
  /** Registry name of the source (shown to people). Falls back to source_id. */
  source_name?: string;
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
