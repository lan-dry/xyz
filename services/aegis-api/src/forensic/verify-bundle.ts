/**
 * Offline verification of a forensic receipt bundle.
 * Verifies receipt signatures, receipt chain (seq/prev_hash), and cited sealed events.
 */

import {
  computeReceiptHash,
  verifyForensicReceiptSignature,
  type SignedForensicReceipt,
} from "./receipt.js";

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
