/**
 * Offline verification of a forensic receipt bundle.
 * Verifies receipt signatures, receipt chain (seq/prev_hash), cited sealed events,
 * and AEGIS-SRC1 source envelopes when present (G0 legacy without envelope is OK).
 */

import { verifyEnvelope } from "@salanor/aegis-sdk";
import {
  computeReceiptHash,
  verifyForensicReceiptSignature,
  type SignedForensicReceipt,
} from "./receipt.js";
import {
  buildCaseProvenance,
  GRADE_CHANGE_OUTCOME,
  gradeChangeFromReceipt,
  gradeChangeProblems,
  provenanceProblems,
} from "../sources/provenance.js";

export type KeySet = Record<string, string>; // key_id -> public_key_b64

export type SealedEventForVerify = {
  event_id: string;
  event_hash: string;
  sequence_num: number;
  prev_event_hash?: string | null;
  organization_id?: string;
  key_id?: string;
  sig_alg?: string;
  sig_value_b64?: string;
  /** Optional precomputed validity from APS verify */
  signature_valid?: boolean;
};

/** Source key validity window as exported in evidence bundles (ISO timestamps). */
export type SourceRegistryEntry = {
  key_id: string;
  source_id: string;
  public_key_b64: string;
  valid_from: string;
  valid_to: string | null;
  status: string;
};

export type ForensicBundle = {
  receipts: SignedForensicReceipt[];
  sealed_events?: SealedEventForVerify[];
  checkpoint?: {
    seq: number;
    head_hash: string;
    key_id: string;
    sig_value_b64?: string;
  } | null;
  keys: KeySet;
  /** AEGIS-SRC1 source keys referenced by receipts (key_id -> public_key_b64). */
  source_keys?: KeySet;
  /** Source key registry rows for temporal validity checks at envelope.ts. */
  source_registry?: SourceRegistryEntry[];
  /**
   * Single-case extract of the org receipt chain. Other cases' receipts are
   * deliberately absent, so gaps between non-adjacent seq numbers are expected.
   * Adjacent seq numbers must still link via prev_hash, and order must ascend.
   * Each receipt still verifies on its own (hash, signature, cited events).
   */
  subset?: boolean;
};

export type VerifyFinding = {
  code: string;
  message: string;
  record?: string;
};

export type VerifyResult = {
  ok: boolean;
  findings: VerifyFinding[];
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Signed AEGIS-SRC1 envelope on the receipt (or nested under provenance). Missing = G0 OK. */
export function extractSourceEnvelope(
  receipt: SignedForensicReceipt,
): Record<string, unknown> | null {
  const attrs = receipt.attributes;
  if (!isPlainObject(attrs)) return null;
  const candidates = [attrs.source_envelope];
  if (isPlainObject(attrs.provenance)) {
    candidates.push(attrs.provenance.source_envelope);
  }
  for (const c of candidates) {
    if (
      isPlainObject(c) &&
      typeof c.signature === "string" &&
      typeof c.key_id === "string"
    ) {
      return c;
    }
  }
  return null;
}

/**
 * active/rotated OK when valid_from..valid_to covers ts; revoked always fails.
 * Ingest uses ts >= valid_to as expired.
 */
export function sourceKeyValidAtTs(
  entry: Pick<SourceRegistryEntry, "valid_from" | "valid_to" | "status">,
  ts: string,
): boolean {
  if (entry.status === "revoked") return false;
  if (entry.status !== "active" && entry.status !== "rotated") return false;
  const t = Date.parse(ts);
  const from = Date.parse(entry.valid_from);
  if (Number.isNaN(t) || Number.isNaN(from) || t < from) return false;
  if (entry.valid_to != null && entry.valid_to !== "") {
    const to = Date.parse(entry.valid_to);
    if (Number.isNaN(to) || t >= to) return false;
  }
  return true;
}

async function verifyReceiptSourceEnvelope(
  receipt: SignedForensicReceipt,
  bundle: ForensicBundle,
  findings: VerifyFinding[],
): Promise<void> {
  const envelope = extractSourceEnvelope(receipt);
  if (!envelope) return;

  const keyId = String(envelope.key_id);
  const registry = Array.isArray(bundle.source_registry)
    ? bundle.source_registry
    : undefined;
  const registryEntry = registry?.find((e) => e.key_id === keyId);
  const pub =
    bundle.source_keys?.[keyId] ?? registryEntry?.public_key_b64 ?? undefined;

  if (!pub) {
    findings.push({
      code: "source_key_missing",
      message: `Source key ${keyId} not in bundle`,
      record: receipt.receipt_id,
    });
    return;
  }

  if (registry && registryEntry) {
    const ts = typeof envelope.ts === "string" ? envelope.ts : "";
    if (!sourceKeyValidAtTs(registryEntry, ts)) {
      findings.push({
        code: "source_key_not_valid_at_ts",
        message: `Source key ${keyId} was not valid at envelope.ts`,
        record: receipt.receipt_id,
      });
    }
  }

  const verified = await verifyEnvelope(envelope, pub);
  if (verified.ok) return;
  if (verified.reason === "event_hash_mismatch") {
    findings.push({
      code: "source_event_hash_mismatch",
      message: "Source envelope event_hash does not match event",
      record: receipt.receipt_id,
    });
    return;
  }
  findings.push({
    code: "source_signature_invalid",
    message: "Source envelope signature does not verify",
    record: receipt.receipt_id,
  });
}

/**
 * Stage 2 labelling checks. A receipt WITHOUT a provenance block is legacy (G0) and fine.
 * A block that is present must be well formed, its grade must follow from its checks, and a
 * claimed source signature must be backed by the envelope attached to the receipt. A
 * grade_change receipt must raise the grade from what the case had reached before it.
 * (Editing any of these facts already fails the receipt hash; this catches a re-signed or
 * mis-built block.)
 */
function verifyReceiptProvenance(
  receipt: SignedForensicReceipt,
  all: SignedForensicReceipt[],
  findings: VerifyFinding[],
): void {
  if (receipt.provenance !== undefined) {
    const envelope = extractSourceEnvelope(receipt);
    const problems = provenanceProblems(receipt.provenance, {
      hasEnvelope: envelope !== null,
      envelopeSourceId:
        envelope && typeof envelope.source_id === "string"
          ? envelope.source_id
          : undefined,
      envelopeKeyId:
        envelope && typeof envelope.key_id === "string" ? envelope.key_id : undefined,
    });
    if (problems.length > 0) {
      findings.push({
        code: "provenance_invalid",
        message: problems.join(" "),
        record: receipt.receipt_id,
      });
    }
  }
  if (receipt.outcome === GRADE_CHANGE_OUTCOME) {
    const problems = gradeChangeProblems(receipt);
    const change = gradeChangeFromReceipt(receipt);
    if (problems.length === 0 && change) {
      const earlier = all.filter(
        (x) => x.case_id === receipt.case_id && x.seq < receipt.seq,
      );
      const before = buildCaseProvenance(earlier);
      if (before && before.current_grade !== change.from_grade) {
        problems.push(
          `The change starts from ${change.from_grade} but the case was at ${before.current_grade}.`,
        );
      }
    }
    if (problems.length > 0) {
      findings.push({
        code: "grade_change_invalid",
        message: problems.join(" "),
        record: receipt.receipt_id,
      });
    }
  }
}

export async function verifyForensicBundle(
  bundle: ForensicBundle,
): Promise<VerifyResult> {
  const findings: VerifyFinding[] = [];
  // Bundle order is authoritative (detects swaps). Also check seq set for gaps.
  const receipts = [...bundle.receipts];

  if (receipts.length === 0) {
    findings.push({ code: "empty_bundle", message: "Bundle has no receipts" });
    return { ok: false, findings };
  }

  const subset = bundle.subset === true;
  const sortedSeqs = [...receipts.map((r) => r.seq)].sort((a, b) => a - b);
  for (let i = 1; i < sortedSeqs.length; i++) {
    if (!subset && sortedSeqs[i]! !== sortedSeqs[i - 1]! + 1) {
      findings.push({
        code: "missing_sequence",
        message: `Missing sequence number ${sortedSeqs[i - 1]! + 1}`,
        record: `seq:${sortedSeqs[i - 1]! + 1}`,
      });
    }
  }

  // Detect swapped / chain breaks in presented order
  let expectedPrev: string | null = null;
  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i]!;
    if (i === 0) {
      expectedPrev = r.prev_hash;
    }
    const pub = bundle.keys[r.key_id];
    if (!pub) {
      findings.push({
        code: "unknown_key_id",
        message: `Unknown key_id ${r.key_id}`,
        record: r.receipt_id,
      });
      continue;
    }

    const hashOk = computeReceiptHash(r as unknown as Record<string, unknown>) === r.receipt_hash;
    if (!hashOk) {
      findings.push({
        code: "receipt_hash_mismatch",
        message: "One character changed in a fact (receipt hash mismatch)",
        record: r.receipt_id,
      });
    }

    const sigOk = await verifyForensicReceiptSignature(r, pub);
    if (!sigOk) {
      // Distinguish wrong key vs bad signature when hash is ok
      if (hashOk) {
        findings.push({
          code: "signature_invalid",
          message: "Signature or key does not verify",
          record: r.receipt_id,
        });
      }
    }

    if (i > 0) {
      const prevSeq = receipts[i - 1]!.seq;
      // Subset extracts only link receipts that are adjacent in the org chain.
      const mustLink = !subset || r.seq === prevSeq + 1;
      if (mustLink && r.prev_hash !== expectedPrev) {
        findings.push({
          code: "chain_failure",
          message: "prev_hash chain failure (records may be swapped or modified)",
          record: r.receipt_id,
        });
      }
      const orderOk = subset ? r.seq > prevSeq : r.seq === prevSeq + 1;
      if (!orderOk) {
        findings.push({
          code: "sequence_order",
          message: `Sequence out of order at ${r.seq} (after ${prevSeq})`,
          record: r.receipt_id,
        });
      }
    }

    // Must cite at least one sealed event when present in body
    if (!r.sealed_events || r.sealed_events.length === 0) {
      findings.push({
        code: "missing_sealed_event_ref",
        message: "Receipt does not cite sealed events",
        record: r.receipt_id,
      });
    } else if (bundle.sealed_events && bundle.sealed_events.length > 0) {
      for (const ref of r.sealed_events) {
        const ev = bundle.sealed_events.find((e) => e.event_id === ref.event_id);
        if (!ev) {
          findings.push({
            code: "sealed_event_missing",
            message: `Cited event ${ref.event_id} not in bundle`,
            record: r.receipt_id,
          });
          continue;
        }
        if (ev.event_hash !== ref.event_hash) {
          findings.push({
            code: "sealed_event_hash_mismatch",
            message: `Cited event_hash does not match sealed event ${ref.event_id}`,
            record: r.receipt_id,
          });
        }
        if (ev.sequence_num !== ref.sequence_num) {
          findings.push({
            code: "sealed_event_seq_mismatch",
            message: `Cited sequence_num does not match sealed event ${ref.event_id}`,
            record: r.receipt_id,
          });
        }
      }
    }

    if (r.flags?.demo_clock) {
      findings.push({
        code: "demo_clock",
        message: "Receipt was created while demo clock was active",
        record: r.receipt_id,
      });
    }

    await verifyReceiptSourceEnvelope(r, bundle, findings);
    verifyReceiptProvenance(r, receipts, findings);

    expectedPrev = r.receipt_hash;
  }

  if (bundle.checkpoint) {
    const head = receipts[receipts.length - 1]!;
    if (
      bundle.checkpoint.seq !== head.seq ||
      bundle.checkpoint.head_hash !== head.receipt_hash
    ) {
      findings.push({
        code: "checkpoint_mismatch",
        message: "Checkpoint does not match the head receipt",
        record: `checkpoint:${bundle.checkpoint.seq}`,
      });
    }
  }

  const hard = findings.filter((f) => f.code !== "demo_clock");
  return { ok: hard.length === 0, findings };
}
