/**
 * Plain-language wording for forensic bundle verification (screens, PDF, API).
 * Never leaks internal codes as the only explanation.
 */

import { witnessCheckpointLabel } from "../witness/label.js";
import type { VerifyFinding, VerifyResult } from "./verify-bundle.js";

const PLAIN: Record<string, string> = {
  empty_bundle: "The file contains no signed records to check.",
  missing_sequence:
    "A record is missing. The numbering has a gap, so something was removed.",
  unknown_key_id:
    "A record was signed with a key we do not recognise, so we cannot confirm who signed it.",
  receipt_hash_mismatch:
    "A fact in a record was changed after it was signed (even one character).",
  signature_invalid:
    "The signature does not match the record. It was altered or was not signed by the stated key.",
  chain_failure:
    "The records do not link to each other. They were reordered, swapped or one was changed.",
  sequence_order: "The records are out of order.",
  missing_sealed_event_ref:
    "A record does not point to the sealed event it is based on.",
  sealed_event_missing:
    "A record points to a sealed event that is not in the file.",
  sealed_event_hash_mismatch:
    "A record points to a sealed event, but the event no longer matches what was signed.",
  sealed_event_seq_mismatch:
    "A record points to a sealed event with a different position than what was signed.",
  amount_mismatch:
    "The amount in this record no longer matches its signature.",
  summary_mismatch:
    "The readable summary in the file does not match the signed record. The file was edited.",
  approval_binding_mismatch:
    "The listed approver, role, reason or decision does not match the signed outcome receipt. The file was edited.",
  key_untrusted:
    "The file lists a public key that differs from the one Aegis published for this key, so the signature cannot be trusted.",
  checkpoint_mismatch: "The closing checkpoint does not match the last record.",
  demo_clock: "This record was created in demo mode with a simulated clock.",
  timestamp_invalid:
    "The trusted-time stamp in the file does not match the signed record. The file was edited or the stamp belongs to something else.",
  witness_inclusion_invalid:
    "The Merkle inclusion proof in the file does not recompute to the stated root. The witness section was altered.",
  witness_root_sig_invalid:
    "The Salanor witness checkpoint signature does not match the root hash.",
  witness_timestamp_invalid:
    "The witness-root timestamp token does not match the root hash.",
};

export function plainFindingMessage(finding: VerifyFinding): string {
  return PLAIN[finding.code] ?? finding.message;
}

export type VerifyCheckStatus = "pass" | "fail" | "pending" | "info";

export type VerifyCheck = {
  id: string;
  label: string;
  status: VerifyCheckStatus;
  detail?: string;
};

export type WitnessState = "included" | "pending" | "none";

const FACT_CODES = [
  "amount_mismatch",
  "receipt_hash_mismatch",
  "summary_mismatch",
  "approval_binding_mismatch",
];
const SIGNATURE_CODES = ["signature_invalid"];
const KEY_CODES = ["unknown_key_id", "key_untrusted"];
const CHAIN_CODES = [
  "missing_sequence",
  "chain_failure",
  "sequence_order",
  "checkpoint_mismatch",
  "empty_bundle",
];
const EVENT_CODES = [
  "missing_sealed_event_ref",
  "sealed_event_missing",
  "sealed_event_hash_mismatch",
  "sealed_event_seq_mismatch",
];

function firstDetail(findings: VerifyFinding[], codes: string[]): string | undefined {
  // Honour the order of `codes`: the most specific explanation comes first.
  for (const code of codes) {
    const f = findings.find((x) => x.code === code);
    if (f) return plainFindingMessage(f);
  }
  return undefined;
}

/**
 * What the extra checks (sequence, policy fingerprint, approvals, trusted time)
 * read from the file. Optional: callers that only have a verify result (the PDF)
 * get the original checklist.
 */
export type VerifyContext = {
  receipts?: Array<{
    receipt_id?: string;
    seq?: number;
    outcome?: string;
    issued_at?: string;
    policy?: { policy_id?: string; content_hash?: string | null } | null;
    flags?: {
      demo_clock?: boolean;
      decided_without_aegis?: boolean;
      key_custody?: "kms" | "software_interim";
    } | null;
  }>;
  approvals?: Array<{
    status: string;
    votes?: Array<{ decision: string }>;
  }> | null;
  /** Per-receipt outside time stamps, already re-derived from the tokens. */
  trusted_time?: Array<{
    receipt_id: string;
    status: "stamped" | "pending" | "invalid";
    authority: string | null;
    gen_time_utc: string | null;
  }> | null;
  /** Honest witness wording (Salanor-signed unless externally anchored). */
  witness_label?: string;
  witness_anchoring_type?: string | null;
};

const CHAIN_CODES_EXT = ["chain_failure", "checkpoint_mismatch", "empty_bundle"];
const SEQUENCE_CODES = ["missing_sequence", "sequence_order"];

function policyHashCheck(ctx: VerifyContext): VerifyCheck {
  const receipts = ctx.receipts ?? [];
  const withPolicy = receipts.filter((r) => r.policy);
  if (withPolicy.length === 0) {
    return {
      id: "policy_hash",
      label: "Policy fingerprint recorded",
      status: "info",
      detail: "No policy is cited by these records.",
    };
  }
  const missing = withPolicy.filter((r) => !r.policy?.content_hash);
  return missing.length > 0
    ? {
        id: "policy_hash",
        label: "Policy fingerprint recorded",
        status: "fail",
        detail:
          "A record does not carry the fingerprint of the policy that decided it, so the rules in force cannot be proven.",
      }
    : {
        id: "policy_hash",
        label: "Policy fingerprint recorded",
        status: "pass",
        detail: "Each decision names the exact policy version that was in force.",
      };
}

function approvalsCheck(ctx: VerifyContext): VerifyCheck {
  const receipts = ctx.receipts ?? [];
  const held = receipts.some((r) => r.outcome === "hold" || r.outcome === "stop");
  const outcomeReceipts = receipts.filter(
    (r) =>
      r.outcome === "approved" ||
      r.outcome === "declined" ||
      r.outcome === "released",
  );
  const approvals = ctx.approvals ?? [];
  if (!held && approvals.length === 0 && outcomeReceipts.length === 0) {
    return {
      id: "approvals",
      label: "Approvals on record",
      status: "pass",
      detail: "No human approval was required for this case.",
    };
  }
  if (outcomeReceipts.length > 0) {
    const missingIdentity = outcomeReceipts.some((r) => {
      const body = r as { approvals?: unknown };
      const sealed = Array.isArray(body.approvals) ? body.approvals[0] : null;
      if (!sealed || typeof sealed !== "object") return true;
      const s = sealed as Record<string, unknown>;
      return !(
        typeof s.approver_user_id === "string" &&
        (typeof s.approver_display_name === "string" ||
          typeof s.approver_email === "string") &&
        typeof s.decision === "string"
      );
    });
    if (missingIdentity) {
      return {
        id: "approvals",
        label: "Approvals on record",
        status: "fail",
        detail:
          "A signed outcome receipt is missing the approver identity, role, or decision.",
      };
    }
    return {
      id: "approvals",
      label: "Approvals on record",
      status: "pass",
      detail: "Each human decision is sealed with who decided, their role, and why.",
    };
  }
  const decided = approvals.filter((a) => a.status !== "pending");
  if (approvals.length === 0 || decided.length === 0) {
    return {
      id: "approvals",
      label: "Approvals on record",
      status: "pending",
      detail: "The case was held and no approver decision is in the file yet.",
    };
  }
  const unsigned = decided.filter((a) => (a.votes ?? []).length === 0);
  return unsigned.length > 0
    ? {
        id: "approvals",
        label: "Approvals on record",
        status: "fail",
        detail: "An approval is recorded without the name of the person who decided.",
      }
    : {
        id: "approvals",
        label: "Approvals on record",
        status: "pass",
        detail: "Each approval names who decided and when.",
      };
}

function utcText(isoText: string | null | undefined): string {
  if (!isoText) return "n/a";
  const d = new Date(isoText);
  if (Number.isNaN(d.getTime())) return isoText;
  return `${d.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

/** Where the signing key lives, read from the signed receipt flags. Omitted for older/dev receipts. */
function keyCustodyCheck(ctx: VerifyContext): VerifyCheck | null {
  const flags = (ctx.receipts ?? []).map((r) => r.flags?.key_custody);
  if (flags.some((f) => f === "software_interim")) {
    return {
      id: "key_custody",
      label: "Key custody: software key (interim)",
      status: "info",
      detail:
        "These records were signed with a software key held by the operator while a hardware-backed key (AWS KMS) is being put in place. The signature is valid; the key is not hardware-protected.",
    };
  }
  if (flags.length > 0 && flags.every((f) => f === "kms")) {
    return {
      id: "key_custody",
      label: "Key custody: AWS KMS",
      status: "pass",
      detail: "The signing key lives in AWS KMS; the private key never leaves it.",
    };
  }
  return null;
}

function trustedTimeCheck(ctx: VerifyContext): VerifyCheck {
  const receipts = ctx.receipts ?? [];
  const bad = receipts.filter(
    (r) => !r.issued_at || Number.isNaN(new Date(r.issued_at).getTime()),
  );
  if (bad.length > 0) {
    return {
      id: "trusted_time",
      label: "Signed time recorded",
      status: "fail",
      detail: "A record has no readable signing time.",
    };
  }
  if (receipts.some((r) => r.flags?.demo_clock)) {
    return {
      id: "trusted_time",
      label: "Signed time recorded",
      status: "info",
      detail: "This record was made in demo mode with a simulated clock.",
    };
  }
  const stamps = ctx.trusted_time ?? [];
  if (stamps.length > 0) {
    if (stamps.some((s) => s.status === "invalid")) {
      return {
        id: "trusted_time",
        label: "Trusted time: stamp does not match this record",
        status: "fail",
        detail:
          "The outside time stamp in the file does not belong to the signed record.",
      };
    }
    const byReceipt = new Map(stamps.map((s) => [s.receipt_id, s]));
    const allStamped =
      receipts.length > 0 &&
      receipts.every((r) => {
        const s = r.receipt_id ? byReceipt.get(r.receipt_id) : undefined;
        return s?.status === "stamped";
      });
    if (allStamped) {
      // Name the newest stamped record (highest seq) as the headline.
      const ordered = [...receipts].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
      const last = byReceipt.get(ordered[ordered.length - 1]!.receipt_id ?? "");
      return {
        id: "trusted_time",
        label: `Trusted time: ${last?.authority ?? "time authority"} at ${utcText(last?.gen_time_utc)}`,
        status: "pass",
        detail:
          "An outside time authority (RFC 3161) stamped the record hash. The stamp is stored in the file; check the authority's signature with openssl ts -verify.",
      };
    }
    return {
      id: "trusted_time",
      label: "Trusted time: pending",
      status: "pending",
      detail:
        "The outside time authority has not stamped this record yet. The signing time and the checks above are not affected; the stamp is retried automatically.",
    };
  }
  return {
    id: "trusted_time",
    label: "Signed time recorded",
    status: "pass",
    detail:
      "The signing time is part of the signed record. No outside time authority stamp is attached.",
  };
}

/**
 * Checklist for the Verify screen. Witness is never folded into pass/fail:
 * a pending witness is amber (pending), not a failure and not green.
 * With `ctx` the list also separates sequence from chain and adds the policy
 * fingerprint, approvals and signed-time checks.
 */
export function buildVerifyChecks(
  result: VerifyResult,
  witness: WitnessState,
  ctx?: VerifyContext,
): VerifyCheck[] {
  const { findings } = result;
  const has = (codes: string[]) => findings.some((f) => codes.includes(f.code));
  const status = (codes: string[]): VerifyCheckStatus =>
    has(codes) ? "fail" : "pass";
  const extended = ctx !== undefined;

  const chainCodes = extended ? CHAIN_CODES_EXT : CHAIN_CODES;
  const checks: VerifyCheck[] = [
    {
      id: "key",
      label: "Signed by a recognised key",
      status: status(KEY_CODES),
      detail: firstDetail(findings, KEY_CODES),
    },
    {
      id: "facts",
      label: "Facts unchanged since signing",
      status: status(FACT_CODES),
      detail: firstDetail(findings, FACT_CODES),
    },
    {
      id: "signature",
      label: "Signature matches the record",
      status: status(SIGNATURE_CODES),
      detail: firstDetail(findings, SIGNATURE_CODES),
    },
    {
      id: "chain",
      label: extended ? "Records linked in a chain" : "Records complete, in order and linked",
      status: status(chainCodes),
      detail: firstDetail(findings, chainCodes),
    },
  ];
  if (extended) {
    checks.push({
      id: "sequence",
      label: "Sequence complete and in order",
      status: status(SEQUENCE_CODES),
      detail: firstDetail(findings, SEQUENCE_CODES),
    });
  }
  checks.push({
    id: "sealed_events",
    label: "Sealed events match what was signed",
    status: status(EVENT_CODES),
    detail: firstDetail(findings, EVENT_CODES),
  });
  if (ctx) {
    checks.push(policyHashCheck(ctx), approvalsCheck(ctx));
  }

  const witnessLabel =
    ctx?.witness_label ?? witnessCheckpointLabel(ctx?.witness_anchoring_type);
  checks.push(
    witness === "included"
      ? {
          id: "witness",
          label: witnessLabel,
          status: extended ? "pass" : "info",
          detail:
            "Merkle inclusion, root signature, and timestamp token are in the file. aegis-verify checks them offline.",
        }
      : witness === "pending"
        ? {
            id: "witness",
            label: witnessLabel,
            status: "pending",
            detail:
              "Witness inclusion is still being processed. This does not change the checks above.",
          }
        : {
            id: "witness",
            label: witnessLabel,
            status: "pending",
            detail: "No witness proof is attached to this file.",
          },
  );
  if (ctx) {
    checks.push(trustedTimeCheck(ctx));
    const custody = keyCustodyCheck(ctx);
    if (custody) checks.push(custody);
  }
  return checks;
}

export function witnessStateFromBundle(bundle: {
  witness?: Array<{ status?: string; label?: string; anchoring_type?: string | null }> | null;
}): WitnessState {
  const w = bundle.witness;
  if (!Array.isArray(w) || w.length === 0) return "none";
  return w.every((x) => x.status === "included") ? "included" : "pending";
}

/** Prefer an externally anchored label when any entry is anchored. */
export function witnessLabelFromBundle(bundle: {
  witness?: Array<{ label?: string; anchoring_type?: string | null }> | null;
}): string {
  const w = bundle.witness;
  if (!Array.isArray(w) || w.length === 0) {
    return witnessCheckpointLabel("internal");
  }
  const anchored = w.find(
    (x) =>
      (x.anchoring_type && x.anchoring_type !== "internal") ||
      (typeof x.label === "string" && x.label.toLowerCase().includes("externally")),
  );
  if (anchored?.label) return anchored.label;
  if (anchored?.anchoring_type) return witnessCheckpointLabel(anchored.anchoring_type);
  return w[0]?.label ?? witnessCheckpointLabel(w[0]?.anchoring_type);
}
