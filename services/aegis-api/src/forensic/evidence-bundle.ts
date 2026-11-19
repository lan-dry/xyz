/**
 * Evidence bundle: the signed forensic receipt(s) for one case, packaged so a
 * reviewer can verify them offline with verifyForensicBundle / aegis-verify.
 *
 * The bundle is a superset of ForensicBundle (`receipts`, `sealed_events`, `keys`):
 * pass the whole object straight to verifyForensicBundle. Everything else is
 * convenience for humans and is NOT part of what the signature covers.
 */

import { createHash } from "node:crypto";
import type pg from "pg";
import {
  describeDecision,
  formatApprover,
  formatRuleLabel,
  type DescribeDecisionInput,
} from "../bank/describe-decision.js";
import {
  verifyMerkleProof,
  type MerklePathStep,
} from "@salanor/witness-merkle";
import * as ed from "@noble/ed25519";
import { getInclusionProofByEvent } from "../repo/witness.js";
import { checkpointSigningMessage } from "../witness/sign-checkpoint.js";
import { getReceiptKmsSigner } from "../crypto/kms-ed25519.js";
import {
  CUSTODY_PRODUCTION_NOTE,
  custodyLabel,
  receiptKeyIdFromEnv,
  type KeyCustody,
} from "../crypto/receipt-signing.js";
import { isProductionEnv } from "../boot/production-env.js";
import { getPool } from "../db/pool.js";
import { listPublishedReceiptKeys } from "../repo/receipt-keys.js";
import { witnessCheckpointLabel } from "../witness/label.js";
import {
  witnessCheckpointKeyId,
  witnessCheckpointPublicKeyB64,
} from "../witness/sign-checkpoint.js";
import {
  getReceiptTimestamps,
  type ReceiptTimestamp,
} from "./receipt-timestamp.js";
import { parseRfc3161Reply } from "./tsa.js";
import {
  canonicalReceiptPayload,
  type SignedForensicReceipt,
} from "./receipt.js";
import {
  extractSourceEnvelope,
  verifyForensicBundle,
  type ForensicBundle,
  type SealedEventForVerify,
  type SourceRegistryEntry,
  type VerifyFinding,
  type VerifyResult,
} from "./verify-bundle.js";
import {
  verifyLocalTestTimestamp,
  type TimestampToken,
} from "./rfc3161.js";
import {
  buildVerifyChecks,
  type VerifyCheck,
  plainFindingMessage,
  witnessLabelFromBundle,
  witnessStateFromBundle,
} from "./verify-messages.js";
import { renderOnePagePdf, type PdfLine } from "./minimal-pdf.js";
import {
  buildCaseProvenance,
  GRADE_CHANGE_OUTCOME,
  summarizeReceiptProvenance,
  type CaseProvenanceView,
  type ReceiptProvenanceSummary,
} from "../sources/provenance.js";
import {
  collectCommitmentsFromReceipts,
  verifySuppliedDocuments,
  type SuppliedDocument,
} from "../sources/input-commitments.js";
import { hashApprovedViewFromEventPayload } from "../approvals/approver-binding.js";

export const EVIDENCE_BUNDLE_TYPE = "aegis_evidence_bundle";

export const HOW_TO_VERIFY =
  "Check this file without trusting Aegis. For each receipt, take canonical_payload, " +
  "compute SHA-256 and compare it with receipt_hash (prefixed sha256:). Then verify the " +
  "Ed25519 signature (sig_value_b64) over SHA-256 of the text " +
  '"AEGIS-RECEIPT1\\n<key_id>\\n<canonical_payload>" using the public key listed under ' +
  "keys (compare its fingerprint with the one you were given out of band). Receipts with " +
  "consecutive seq numbers must link: prev_hash of the next equals receipt_hash of the previous. " +
  "When witness[] status is included, recompute Merkle inclusion offline: the leaf is the " +
  "event hash; each node is SHA-256 of the left hex string concatenated with the right hex " +
  "string; walk merkle_path to root_hash, then verify root_sig_value_b64 over " +
  "SHA-256(UTF-8 of lowercase root_hash) and check the RFC 3161 token imprint equals the " +
  "root hash. Or run the aegis-verify tool on this file, or drop it on the Verify page. " +
  "Changing any byte of the facts makes verification fail.";

export type EvidenceWitnessTimestamp = {
  status: "stamped" | "pending";
  authority: string | null;
  gen_time_utc: string | null;
  tsa_url: string | null;
  message_hash: string;
  token_b64: string | null;
};

export type EvidenceWitness = {
  event_id: string;
  status: "included" | "pending";
  /** Honest label: Salanor-signed unless externally anchored. */
  label?: string;
  proof_id?: string;
  root_id?: string;
  root_hash?: string;
  leaf_index?: number;
  tree_size?: number;
  merkle_path?: MerklePathStep[];
  root_sig_value_b64?: string | null;
  root_sig_key_id?: string | null;
  anchoring_type?: string | null;
  external_tx_id?: string | null;
  timestamp?: EvidenceWitnessTimestamp | null;
};

export type EvidenceApproval = {
  approval_id: string;
  status: string;
  requested_at_utc: string | null;
  decided_at_utc: string | null;
  required_role: string | null;
  /** Stage 5: mirror of sealed approved_view_hash for soft-section checks. */
  approved_view_hash?: string | null;
  votes: Array<{
    voter_email: string | null;
    voter_user_id?: string | null;
    voter_account_id?: string | null;
    session_id?: string | null;
    decision: string;
    reason: string | null;
    at_utc: string | null;
    /** Present when the approver relied on a time-bound delegation. */
    delegation?: {
      acted_by_name: string | null;
      delegated_by_name: string | null;
      delegated_by_email: string | null;
      role_key: string;
      expires_at_utc: string | null;
    };
  }>;
};

/** Where each listed signing key lives (informational; signed copy is receipt.flags.key_custody). */
export type EvidenceKeyCustody = {
  custody: KeyCustody;
  label: string;
  status?: "active" | "retired";
};

/**
 * Outside time-authority stamp over receipt_hash. Not covered by the receipt
 * signature (it is attached after issue); the verifier re-reads the token.
 */
export type EvidenceTrustedTime = {
  receipt_id: string;
  status: "stamped" | "pending";
  authority: string | null;
  gen_time_utc: string | null;
  tsa_url: string | null;
  message_hash: string;
  token_b64: string | null;
};

export type EvidenceSealedEvent = SealedEventForVerify & {
  emitted_at_utc?: string | null;
  provisional?: boolean;
};

export type EvidenceReceiptSummary = {
  receipt_id: string;
  seq: number;
  prev_hash: string | null;
  receipt_hash: string;
  event_hash: string | null;
  event_id: string | null;
  event_seq: number | null;
  canonical_payload: string;
  sig_alg: string;
  sig_value_b64: string;
  key_id: string;
  public_key_b64: string | null;
  public_key_fingerprint: string | null;
  issued_at_utc: string;
  event_emitted_at_utc: string | null;
  outcome: string;
  policy: SignedForensicReceipt["policy"] | null;
  matched_rules: SignedForensicReceipt["matched_rules"];
  decision_basis: SignedForensicReceipt["decision_basis"] | null;
  plain_summary: string;
  who_approved: string;
  /**
   * Where this receipt's data came from, read from its signed provenance block.
   * Absent on bundles exported before Stage 2.
   */
  provenance?: ReceiptProvenanceSummary;
};

export type EvidenceBundle = ForensicBundle & {
  bundle_type: typeof EVIDENCE_BUNDLE_TYPE;
  schema_version: 1;
  generated_at_utc: string;
  organization_id: string;
  case_id: string | null;
  trace_id: string;
  sealed_events: EvidenceSealedEvent[];
  key_fingerprints: Record<string, string>;
  /** key_id -> custody (kms / software_interim / software). */
  key_custody?: Record<string, EvidenceKeyCustody>;
  /** RFC 3161 stamps per receipt; null when trusted time is not configured. */
  trusted_time?: EvidenceTrustedTime[] | null;
  evidence: EvidenceReceiptSummary[];
  approvals: EvidenceApproval[];
  witness: EvidenceWitness[] | null;
  /**
   * Stage 2 honest labelling: grade at seal, current grade (from sealed grade-change receipts),
   * the five checks, and plain wording. Derived from the signed receipts above; the verifier
   * recomputes it and flags any difference. Absent on bundles exported before Stage 2.
   */
  provenance?: CaseProvenanceView | null;
  /**
   * Stage 3: Aegis decision public keys (same custody as receipt keys; domain AEGIS-TOKEN1).
   * key_id -> public_key_b64. Present when the case has decision tokens or keys were supplied.
   */
  decision_keys?: Record<string, string>;
  /** Stage 3: signed decision tokens issued for this case. */
  decision_tokens?: Array<Record<string, unknown>>;
  /**
   * Stage 7: SHA-256 commitments to source documents, bound from sealed receipt attributes.
   * The verifier accepts supplied documents and checks them against these hashes.
   */
  input_commitments?: Array<{
    name: string;
    sha256: string;
    media_type?: string | null;
    size_bytes?: number | null;
  }>;
  how_to_verify: string;
  /** Result when the server exported this file; informational only. */
  export_check?: { ok: boolean; findings: string[] };
};

export type EvidenceBundleInput = {
  organization_id: string;
  trace_id: string;
  case_id?: string | null;
  receipts: SignedForensicReceipt[];
  sealed_events?: Array<
    SealedEventForVerify & { emitted_at?: Date | string | null }
  >;
  keys: Record<string, string>;
  /** AEGIS-SRC1 source keys (key_id -> public_key_b64) for offline envelope verify. */
  source_keys?: Record<string, string>;
  /** Source key registry rows covering envelopes in this case. */
  source_registry?: SourceRegistryEntry[];
  key_custody?: Record<string, EvidenceKeyCustody>;
  trusted_time?: EvidenceTrustedTime[] | null;
  approvals?: EvidenceApproval[];
  witness?: EvidenceWitness[] | null;
  generated_at?: string;
  /**
   * Default true: a single-case extract of the org chain (gaps to other cases'
   * seq numbers are expected). Pass false for a contiguous chain export where
   * every missing/swapped receipt must be detected.
   */
  subset?: boolean;
  /** Stage 3 decision public keys (key_id -> public_key_b64). */
  decision_keys?: Record<string, string>;
  /** Stage 3 decision tokens for this case. */
  decision_tokens?: Array<Record<string, unknown>>;
};

export function publicKeyFingerprint(publicKeyB64: string): string {
  const raw = Buffer.from(publicKeyB64, "base64");
  return `sha256:${createHash("sha256").update(raw).digest("hex")}`;
}

/**
 * Stage 5: copy sealed approver_binding / approved_view_hash into the soft
 * approvals section so a post-export edit of the soft section fails verify.
 */
function enrichApprovalsFromSealed(
  soft: EvidenceApproval[],
  receipts: SignedForensicReceipt[],
): EvidenceApproval[] {
  const byId = new Map<string, Record<string, unknown>>();
  for (const r of receipts) {
    const first = Array.isArray(r.approvals) ? r.approvals[0] : null;
    if (!first || typeof first !== "object") continue;
    const s = first as Record<string, unknown>;
    if (typeof s.approval_id === "string") byId.set(s.approval_id, s);
  }
  return soft.map((a) => {
    const sealed = byId.get(a.approval_id);
    if (!sealed) return a;
    const binding =
      sealed.approver_binding && typeof sealed.approver_binding === "object"
        ? (sealed.approver_binding as Record<string, unknown>)
        : null;
    const votes = a.votes.map((v, i) => {
      if (i !== 0) return v;
      return {
        ...v,
        voter_user_id:
          v.voter_user_id ??
          (typeof sealed.approver_user_id === "string"
            ? sealed.approver_user_id
            : typeof binding?.membership_id === "string"
              ? binding.membership_id
              : null),
        voter_account_id:
          v.voter_account_id ??
          (typeof binding?.account_id === "string" ? binding.account_id : null),
        session_id:
          v.session_id ??
          (typeof binding?.session_id === "string" ? binding.session_id : null),
      };
    });
    return {
      ...a,
      approved_view_hash:
        a.approved_view_hash ??
        (typeof sealed.approved_view_hash === "string"
          ? sealed.approved_view_hash
          : null),
      votes,
    };
  });
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function numberOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function attrAmount(attrs: Record<string, unknown> | undefined): {
  amount: number | null;
  currency: string | null;
} {
  const a = attrs ?? {};
  return {
    amount: numberOrNull(a.amount ?? a.amount_rwf ?? a.loan_amount),
    currency: typeof a.currency === "string" ? a.currency : null,
  };
}

function whoApproved(
  receipt: SignedForensicReceipt,
  approvals: EvidenceApproval[],
): string {
  // Prefer the signed outcome receipt's own approvals[] (A1).
  const sealed = Array.isArray(receipt.approvals) ? receipt.approvals : [];
  if (sealed.length > 0) {
    const first = sealed[0] as Record<string, unknown>;
    const name =
      typeof first.approver_display_name === "string"
        ? first.approver_display_name
        : null;
    const role =
      typeof first.approver_role_label === "string"
        ? first.approver_role_label
        : typeof first.approver_role === "string"
          ? first.approver_role
          : null;
    const roleKey =
      typeof first.approver_role === "string" ? first.approver_role : null;
    const who =
      formatApprover(name, roleKey) ??
      (name && role && role.toLowerCase() !== name.toLowerCase()
        ? `${name} · ${role}`
        : name);
    // Email is technical-only; never the primary "who approved" string.
    if (receipt.outcome === "approved" && who) return `Approved by ${who}.`;
    if (receipt.outcome === "declined" && who) return `Declined by ${who}.`;
    if (receipt.outcome === "released" && who) return `Released by ${who}.`;
  }
  const ruleId =
    receipt.decision_basis?.decided_by_rule_id ??
    receipt.matched_rules[0]?.rule_id ??
    null;
  const rule = formatRuleLabel(ruleId) ?? null;
  const decided = approvals.filter((a) => a.status === "approved");
  if (decided.length > 0) {
    const names = decided.flatMap((a) =>
      a.votes
        .filter((v) => v.decision === "approved")
        .map((v) => {
          const who =
            v.delegation?.acted_by_name ??
            "an authorised approver";
          if (!v.delegation) return who;
          const from =
            v.delegation.delegated_by_name ?? "the role holder";
          return `${who}, acting for ${from} under a time-limited delegation`;
        }),
    );
    if (names.length > 0) return `Approved by ${[...new Set(names)].join(", ")}.`;
    return "Approved by an authorised approver.";
  }
  if (approvals.some((a) => a.status === "rejected")) return "Declined by an approver.";
  if (approvals.some((a) => a.status === "pending")) return "Waiting for an approver.";
  // A4: human outcomes never claim an automatic allow.
  if (
    receipt.outcome === "approved" ||
    receipt.outcome === "released" ||
    receipt.outcome === "declined" ||
    receipt.outcome === "rejected"
  ) {
    if (receipt.outcome === "declined" || receipt.outcome === "rejected") {
      return "Declined by an authorised approver.";
    }
    return "Approved by an authorised approver.";
  }
  if (receipt.outcome === "allow") {
    return rule
      ? `No approval needed: allowed automatically by rule ${rule}.`
      : "No approval needed: allowed automatically by policy.";
  }
  if (receipt.outcome === "hold") return "Held. No approval has been recorded yet.";
  if (receipt.outcome === "stop") return "Stopped by policy. No approval was requested.";
  return "No approval recorded.";
}

export function summarizeReceipt(
  receipt: SignedForensicReceipt,
  opts: {
    keys: Record<string, string>;
    sealed_events: EvidenceSealedEvent[];
    approvals: EvidenceApproval[];
  },
): EvidenceReceiptSummary {
  const ref = receipt.sealed_events?.[0];
  const ev = ref
    ? opts.sealed_events.find((e) => e.event_id === ref.event_id)
    : undefined;
  const pub = opts.keys[receipt.key_id] ?? null;
  const { amount, currency } = attrAmount(receipt.attributes);
  const body = receipt as SignedForensicReceipt & {
    product?: string;
    event_type?: string;
  };
  const sealedApproval =
    Array.isArray(receipt.approvals) && receipt.approvals[0]
      ? (receipt.approvals[0] as Record<string, unknown>)
      : null;
  const attrs =
    receipt.attributes && typeof receipt.attributes === "object"
      ? (receipt.attributes as Record<string, unknown>)
      : {};
  const plain =
    receipt.plain_summary ??
    describeDecision({
      outcome: receipt.outcome,
      product: body.product ?? null,
      event_type: body.event_type ?? null,
      amount,
      currency,
      policy_version: receipt.policy?.version ?? null,
      matched_rules: receipt.matched_rules,
      decision_basis: (receipt.decision_basis ??
        null) as DescribeDecisionInput["decision_basis"],
      mode: receipt.mode,
      would_have: receipt.would_have ?? null,
      approver_name:
        typeof sealedApproval?.approver_display_name === "string"
          ? sealedApproval.approver_display_name
          : null,
      approver_role:
        typeof sealedApproval?.approver_role === "string"
          ? sealedApproval.approver_role
          : null,
      approved_at:
        typeof sealedApproval?.decided_at === "string"
          ? sealedApproval.decided_at
          : null,
      approval_reason:
        typeof sealedApproval?.reason === "string" ? sealedApproval.reason : null,
      required_role:
        typeof attrs.required_role === "string" ? attrs.required_role : null,
      required_role_label:
        typeof attrs.required_role_label === "string"
          ? attrs.required_role_label
          : null,
    });
  return {
    receipt_id: receipt.receipt_id,
    seq: receipt.seq,
    prev_hash: receipt.prev_hash,
    receipt_hash: receipt.receipt_hash,
    event_hash: ref?.event_hash ?? null,
    event_id: ref?.event_id ?? null,
    event_seq: ref?.sequence_num ?? null,
    canonical_payload: canonicalReceiptPayload(
      receipt as unknown as Record<string, unknown>,
    ),
    sig_alg: receipt.sig_alg,
    sig_value_b64: receipt.sig_value_b64,
    key_id: receipt.key_id,
    public_key_b64: pub,
    public_key_fingerprint: pub ? publicKeyFingerprint(pub) : null,
    issued_at_utc: receipt.issued_at,
    event_emitted_at_utc: ev?.emitted_at_utc ?? null,
    outcome: receipt.outcome,
    policy: receipt.policy ?? null,
    matched_rules: receipt.matched_rules ?? [],
    decision_basis: receipt.decision_basis ?? null,
    plain_summary: plain,
    who_approved: whoApproved(receipt, opts.approvals),
    provenance: summarizeReceiptProvenance(receipt),
  };
}

/** Stable JSON (sorted keys) for comparing derived sections with their recomputation. */
function stableJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v !== null && typeof v === "object") {
      const o = v as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(o)
          .sort()
          .map((k) => [k, sort(o[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

/** Pure builder: all inputs already loaded. Unit-testable without a database. */
export function buildEvidenceBundle(input: EvidenceBundleInput): EvidenceBundle {
  const receipts = [...input.receipts].sort((a, b) => a.seq - b.seq);

  const dbEvents: EvidenceSealedEvent[] = (input.sealed_events ?? []).map((e) => ({
    event_id: e.event_id,
    event_hash: e.event_hash,
    sequence_num: Number(e.sequence_num),
    prev_event_hash: e.prev_event_hash ?? null,
    key_id: e.key_id,
    sig_alg: e.sig_alg,
    sig_value_b64: e.sig_value_b64,
    emitted_at_utc: iso(e.emitted_at ?? null),
    ...(e.payload !== undefined ? { payload: e.payload } : {}),
  }));
  // Every cited event must be present or the verifier reports it missing.
  // Provisional citations (evt_gov_*) have no stored event: echo the signed ref.
  const sealed: EvidenceSealedEvent[] = [...dbEvents];
  for (const r of receipts) {
    for (const ref of r.sealed_events ?? []) {
      if (!sealed.some((e) => e.event_id === ref.event_id)) {
        sealed.push({
          event_id: ref.event_id,
          event_hash: ref.event_hash,
          sequence_num: ref.sequence_num,
          provisional: true,
        });
      }
    }
  }

  const keys: Record<string, string> = {};
  for (const r of receipts) {
    const k = input.keys[r.key_id];
    if (k) keys[r.key_id] = k;
  }
  const key_fingerprints: Record<string, string> = {};
  for (const [id, pub] of Object.entries(keys)) {
    key_fingerprints[id] = publicKeyFingerprint(pub);
  }

  const key_custody: Record<string, EvidenceKeyCustody> = {};
  for (const id of Object.keys(keys)) {
    const given = input.key_custody?.[id];
    if (given) {
      key_custody[id] = given;
      continue;
    }
    const signed = receipts.find((r) => r.key_id === id)?.flags?.key_custody;
    if (signed) key_custody[id] = { custody: signed, label: custodyLabel(signed) };
  }

  const approvals = enrichApprovalsFromSealed(
    input.approvals ?? [],
    receipts,
  );
  const evidence = receipts.map((r) =>
    summarizeReceipt(r, { keys, sealed_events: sealed, approvals }),
  );

  const source_keys =
    input.source_keys && Object.keys(input.source_keys).length > 0
      ? { ...input.source_keys }
      : undefined;
  const source_registry =
    input.source_registry && input.source_registry.length > 0
      ? input.source_registry
      : undefined;
  const decision_keys =
    input.decision_keys && Object.keys(input.decision_keys).length > 0
      ? { ...input.decision_keys }
      : undefined;
  const decision_tokens =
    input.decision_tokens && input.decision_tokens.length > 0
      ? input.decision_tokens
      : undefined;
  const input_commitments = collectCommitmentsFromReceipts(receipts);

  return {
    bundle_type: EVIDENCE_BUNDLE_TYPE,
    schema_version: 1,
    generated_at_utc: input.generated_at ?? new Date().toISOString(),
    organization_id: input.organization_id,
    case_id: input.case_id ?? receipts[0]?.case_id ?? null,
    trace_id: input.trace_id,
    receipts,
    sealed_events: sealed,
    keys,
    ...(source_keys ? { source_keys } : {}),
    ...(source_registry ? { source_registry } : {}),
    ...(decision_keys ? { decision_keys } : {}),
    ...(decision_tokens ? { decision_tokens } : {}),
    ...(input_commitments.length > 0 ? { input_commitments } : {}),
    key_fingerprints,
    key_custody,
    trusted_time: input.trusted_time ?? null,
    // Only this case's receipts are present; gaps to other cases' seq are expected.
    subset: input.subset ?? true,
    evidence,
    approvals,
    witness: input.witness ?? null,
    provenance: buildCaseProvenance(receipts),
    how_to_verify: HOW_TO_VERIFY,
  };
}

export async function verifyEvidenceBundle(
  bundle: ForensicBundle,
): Promise<VerifyResult> {
  return verifyForensicBundle(bundle);
}

export type BundleFileVerification = {
  ok: boolean;
  error?: "not_a_bundle";
  message: string;
  checks: VerifyCheck[];
  findings: Array<{ code: string; message: string; record?: string }>;
  receipts: number;
  case_id: string | null;
  trace_id: string | null;
  witness: "included" | "pending" | "none";
  /**
   * Two separate answers (never one green "verified"):
   * record_line  — is the record intact (signed, unchanged)?
   * source_line  — where did the data come from, and how much is vouched for?
   */
  record_line: string | null;
  source_line: string | null;
  /** Provenance recomputed from the signed receipts in the file (not copied from the file's summary). */
  provenance: CaseProvenanceView | null;
};

function notABundle(message: string): BundleFileVerification {
  return {
    ok: false,
    error: "not_a_bundle",
    message,
    checks: [],
    findings: [],
    receipts: 0,
    case_id: null,
    trace_id: null,
    witness: "none",
    record_line: null,
    source_line: null,
    provenance: null,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** True when the amount in the signed summary text differs from the receipt's amount. */
function amountDiffers(
  canonicalPayload: unknown,
  attributes: Record<string, unknown> | undefined,
): boolean {
  if (typeof canonicalPayload !== "string") return false;
  try {
    const parsed = JSON.parse(canonicalPayload) as {
      attributes?: Record<string, unknown>;
    };
    const was = attrAmount(parsed.attributes).amount;
    const now = attrAmount(attributes).amount;
    return was !== now;
  } catch {
    return false;
  }
}

/**
 * What the file says about trusted time, re-derived from each stored token:
 * a stamped entry only counts when the token's imprint equals the receipt hash
 * and its genTime/authority match what the file claims. Otherwise "invalid".
 * (The authority's own signature is checked with `openssl ts -verify`.)
 */
export function readTrustedTime(bundle: {
  receipts: SignedForensicReceipt[];
  trusted_time?: EvidenceTrustedTime[] | null;
}): Array<{
  receipt_id: string;
  status: "stamped" | "pending" | "invalid";
  authority: string | null;
  gen_time_utc: string | null;
}> {
  if (!Array.isArray(bundle.trusted_time)) return [];
  const out: Array<{
    receipt_id: string;
    status: "stamped" | "pending" | "invalid";
    authority: string | null;
    gen_time_utc: string | null;
  }> = [];
  for (const t of bundle.trusted_time) {
    if (!t || typeof t.receipt_id !== "string") continue;
    const receipt = bundle.receipts.find((r) => r.receipt_id === t.receipt_id);
    if (t.status !== "stamped") {
      out.push({
        receipt_id: t.receipt_id,
        status: "pending",
        authority: t.authority ?? null,
        gen_time_utc: null,
      });
      continue;
    }
    let valid = false;
    if (receipt && typeof t.token_b64 === "string" && t.token_b64) {
      const parsed = parseRfc3161Reply(Buffer.from(t.token_b64, "base64"));
      valid =
        parsed.ok &&
        `sha256:${parsed.message_hash_hex}` === receipt.receipt_hash &&
        parsed.gen_time === t.gen_time_utc;
    }
    out.push({
      receipt_id: t.receipt_id,
      status: valid ? "stamped" : "invalid",
      authority: t.authority ?? null,
      gen_time_utc: t.gen_time_utc ?? null,
    });
  }
  return out;
}

/**
 * Verify an uploaded evidence bundle (parsed JSON) and report plain checks.
 * `trustedKeys` (key_id -> public key) are keys Aegis itself published: a bundle
 * listing a different key under the same id is rejected.
 */
export async function verifyBundleFile(
  raw: unknown,
  opts: {
    trustedKeys?: Record<string, string>;
    /** Stage 7: optional documents to check against bundle.input_commitments. */
    suppliedDocuments?: SuppliedDocument[];
  } = {},
): Promise<BundleFileVerification> {
  if (!isRecord(raw) || !Array.isArray(raw.receipts)) {
    return notABundle(
      "This does not look like an Aegis evidence bundle. Download one from a case and drop that file here.",
    );
  }
  if (raw.receipts.length === 0) {
    return notABundle("The file contains no signed records to check.");
  }
  for (const r of raw.receipts) {
    if (
      !isRecord(r) ||
      typeof r.receipt_id !== "string" ||
      typeof r.receipt_hash !== "string" ||
      typeof r.sig_value_b64 !== "string" ||
      typeof r.key_id !== "string" ||
      typeof r.seq !== "number"
    ) {
      return notABundle(
        "A record in the file is incomplete, so it cannot be checked. The file is damaged or was edited.",
      );
    }
  }
  const bundle = raw as unknown as EvidenceBundle;
  if (!isRecord(bundle.keys)) {
    return notABundle("The file has no public keys to check signatures against.");
  }

  const result = await verifyForensicBundle(bundle);
  const findings: VerifyFinding[] = [...result.findings];

  for (const [keyId, pub] of Object.entries(bundle.keys)) {
    const trusted = opts.trustedKeys?.[keyId];
    if (trusted && trusted !== pub) {
      findings.push({
        code: "key_untrusted",
        message: `Key ${keyId} differs from the published key`,
      });
    }
  }

  if (Array.isArray(bundle.evidence)) {
    for (const ev of bundle.evidence) {
      const r = bundle.receipts.find((x) => x.receipt_id === ev?.receipt_id);
      if (!r) {
        findings.push({
          code: "summary_mismatch",
          message: "Summary refers to a receipt that is not in the file",
          record: ev?.receipt_id,
        });
        continue;
      }
      const ref = r.sealed_events?.[0];
      const same =
        ev.receipt_hash === r.receipt_hash &&
        ev.sig_value_b64 === r.sig_value_b64 &&
        ev.key_id === r.key_id &&
        ev.seq === r.seq &&
        (ev.prev_hash ?? null) === (r.prev_hash ?? null) &&
        (ev.event_hash ?? null) === (ref?.event_hash ?? null) &&
        ev.canonical_payload ===
          canonicalReceiptPayload(r as unknown as Record<string, unknown>);
      if (!same) {
        findings.push({
          code: "summary_mismatch",
          message: "Summary does not match the signed receipt",
          record: r.receipt_id,
        });
        if (amountDiffers(ev.canonical_payload, r.attributes)) {
          findings.push({
            code: "amount_mismatch",
            message: "Amount differs from the signed summary",
            record: r.receipt_id,
          });
        }
      }
      // Stage 2: the unsigned provenance summary must match the signed provenance block.
      if (
        ev.provenance !== undefined &&
        stableJson(ev.provenance) !== stableJson(summarizeReceiptProvenance(r))
      ) {
        findings.push({
          code: "summary_mismatch",
          message: "Source label in the summary does not match the signed receipt",
          record: r.receipt_id,
        });
      }
      // Soft who_approved / plain_summary must match the signed body when present.
      if (
        typeof ev.who_approved === "string" &&
        ev.who_approved !== whoApproved(r, bundle.approvals ?? []) &&
        (r.outcome === "approved" ||
          r.outcome === "declined" ||
          r.outcome === "released")
      ) {
        findings.push({
          code: "approval_binding_mismatch",
          message: "Approver summary does not match the signed receipt",
          record: r.receipt_id,
        });
      }
      if (
        typeof ev.plain_summary === "string" &&
        typeof r.plain_summary === "string" &&
        ev.plain_summary !== r.plain_summary &&
        (r.outcome === "approved" ||
          r.outcome === "declined" ||
          r.outcome === "released")
      ) {
        findings.push({
          code: "approval_binding_mismatch",
          message: "Plain summary does not match the signed receipt",
          record: r.receipt_id,
        });
      }
    }
  }

  // A1: hold/stop receipts that were decided must have a follow-on outcome receipt
  // whose signed approvals[] match the unsigned approvals section when present.
  for (const prior of bundle.receipts) {
    if (prior.outcome !== "hold" && prior.outcome !== "stop") continue;
    const followOns = bundle.receipts.filter((r) => {
      const attrs = r.attributes as Record<string, unknown> | undefined;
      const sealed = Array.isArray(r.approvals) ? r.approvals[0] : null;
      const followHash =
        (typeof attrs?.follows_receipt_hash === "string"
          ? attrs.follows_receipt_hash
          : null) ??
        (sealed &&
        typeof (sealed as Record<string, unknown>).follows_receipt_hash === "string"
          ? String((sealed as Record<string, unknown>).follows_receipt_hash)
          : null);
      return (
        (r.outcome === "approved" ||
          r.outcome === "declined" ||
          r.outcome === "released") &&
        followHash === prior.receipt_hash
      );
    });
    const decidedApprovals = (bundle.approvals ?? []).filter(
      (a) => a.status === "approved" || a.status === "rejected",
    );
    if (decidedApprovals.length > 0 && followOns.length === 0) {
      findings.push({
        code: "approval_binding_mismatch",
        message:
          "A human decision is listed without a signed outcome receipt that follows the hold record",
        record: prior.receipt_id,
      });
    }
    for (const outcome of followOns) {
      const sealed = Array.isArray(outcome.approvals) ? outcome.approvals[0] : null;
      if (!sealed || typeof sealed !== "object") continue;
      const s = sealed as Record<string, unknown>;
      for (const soft of bundle.approvals ?? []) {
        if (soft.approval_id && soft.approval_id === s.approval_id) {
          const softDecision =
            soft.status === "rejected"
              ? "declined"
              : soft.status === "approved"
                ? outcome.outcome === "released"
                  ? "released"
                  : "approved"
                : soft.status;
          if (
            softDecision !== s.decision &&
            soft.status !== "pending" &&
            soft.status !== s.decision
          ) {
            findings.push({
              code: "approval_binding_mismatch",
              message: "Unsigned approval decision does not match the signed outcome receipt",
              record: outcome.receipt_id,
            });
          }
          const softVote = soft.votes?.[0];
          if (
            softVote?.voter_email &&
            typeof s.approver_email === "string" &&
            softVote.voter_email !== s.approver_email
          ) {
            findings.push({
              code: "approval_binding_mismatch",
              message: "Unsigned approver does not match the signed outcome receipt",
              record: outcome.receipt_id,
            });
          }
          if (
            softVote?.reason &&
            typeof s.reason === "string" &&
            softVote.reason !== s.reason
          ) {
            findings.push({
              code: "approval_binding_mismatch",
              message: "Unsigned approval reason does not match the signed outcome receipt",
              record: outcome.receipt_id,
            });
          }
          // Stage 5: soft identity fields must match the sealed approver_binding.
          const binding =
            s.approver_binding && typeof s.approver_binding === "object"
              ? (s.approver_binding as Record<string, unknown>)
              : null;
          if (
            softVote?.voter_account_id &&
            typeof binding?.account_id === "string" &&
            softVote.voter_account_id !== binding.account_id
          ) {
            findings.push({
              code: "approval_binding_mismatch",
              message:
                "Unsigned approver account id does not match the signed outcome receipt",
              record: outcome.receipt_id,
            });
          }
          if (
            softVote?.voter_user_id &&
            typeof binding?.membership_id === "string" &&
            softVote.voter_user_id !== binding.membership_id &&
            softVote.voter_user_id !== s.approver_user_id
          ) {
            findings.push({
              code: "approval_binding_mismatch",
              message:
                "Unsigned approver membership id does not match the signed outcome receipt",
              record: outcome.receipt_id,
            });
          }
          if (
            softVote?.session_id &&
            typeof binding?.session_id === "string" &&
            softVote.session_id !== binding.session_id
          ) {
            findings.push({
              code: "approval_binding_mismatch",
              message:
                "Unsigned approver session id does not match the signed outcome receipt",
              record: outcome.receipt_id,
            });
          }
          if (
            soft.approved_view_hash &&
            typeof s.approved_view_hash === "string" &&
            soft.approved_view_hash !== s.approved_view_hash
          ) {
            findings.push({
              code: "approval_view_hash_mismatch",
              message:
                "Unsigned approval view hash does not match the signed outcome receipt",
              record: outcome.receipt_id,
            });
          }
        }
      }

      // Stage 5: approved_view_hash must equal the hash of the gate event's request preview.
      if (typeof s.approved_view_hash === "string") {
        const gateId =
          (Array.isArray(prior.sealed_events) &&
            prior.sealed_events[0]?.event_id) ||
          null;
        const gateEvent = gateId
          ? (bundle.sealed_events ?? []).find((e) => e.event_id === gateId)
          : null;
        if (gateEvent?.payload && typeof gateEvent.payload === "object") {
          const expected = hashApprovedViewFromEventPayload(
            gateEvent.payload as Record<string, unknown>,
          );
          if (expected !== s.approved_view_hash) {
            findings.push({
              code: "approval_view_hash_mismatch",
              message:
                "The approved view hash does not match the gate event the approver decided on",
              record: outcome.receipt_id,
            });
          }
        }
      }
    }
  }

  // Stage 2: the case-level provenance in the file (grades, checks, wording) is derived from the
  // signed receipts. Recompute it; a file that edits the displayed grade no longer matches.
  const provenance = buildCaseProvenance(bundle.receipts);
  if (
    bundle.provenance !== undefined &&
    stableJson(bundle.provenance) !== stableJson(provenance)
  ) {
    findings.push({
      code: "summary_mismatch",
      message: "Source and grade in the summary do not match the signed receipts",
    });
  }

  // Stage 7: input commitments bound from sealed receipts; optional document check.
  const boundCommitments = collectCommitmentsFromReceipts(bundle.receipts);
  if (
    bundle.input_commitments !== undefined &&
    stableJson(bundle.input_commitments) !== stableJson(boundCommitments)
  ) {
    findings.push({
      code: "summary_mismatch",
      message: "Input commitments in the summary do not match the signed receipts",
    });
  }
  if (opts.suppliedDocuments && opts.suppliedDocuments.length > 0) {
    const docCheck = verifySuppliedDocuments(
      boundCommitments.length > 0
        ? boundCommitments
        : (bundle.input_commitments ?? []),
      opts.suppliedDocuments,
    );
    for (const c of docCheck.checks) {
      if (!c.ok) {
        findings.push({
          code: "input_commitment_mismatch",
          message: c.message,
        });
      }
    }
  }

  const trustedTime = readTrustedTime(bundle);
  for (const bad of trustedTime.filter((t) => t.status === "invalid")) {
    findings.push({
      code: "timestamp_invalid",
      message: "The trusted-time stamp does not match the signed record",
      record: bad.receipt_id,
    });
  }

  // A5: when the bundle includes a complete witness proof, verify it offline.
  // Older bundles without merkle_path keep verifying (no hard failure).
  if (Array.isArray(bundle.witness)) {
    for (const w of bundle.witness) {
      if (!w || w.status !== "included") continue;
      const path = w.merkle_path;
      const rootHash = w.root_hash;
      if (!Array.isArray(path) || typeof rootHash !== "string") continue;
      const sealed =
        bundle.sealed_events?.find((e) => e.event_id === w.event_id) ??
        bundle.receipts
          .flatMap((r) => r.sealed_events ?? [])
          .find((e) => e.event_id === w.event_id);
      const leaf = sealed?.event_hash;
      if (typeof leaf !== "string") continue;
      if (!verifyMerkleProof(leaf, rootHash, path as MerklePathStep[])) {
        findings.push({
          code: "witness_inclusion_invalid",
          message: "Merkle inclusion proof does not match root",
          record: w.event_id,
        });
      }
      if (
        typeof w.root_sig_value_b64 === "string" &&
        w.root_sig_value_b64 &&
        typeof w.root_sig_key_id === "string"
      ) {
        const pub =
          bundle.keys?.[w.root_sig_key_id] ??
          (bundle as { witness_keys?: Record<string, string> }).witness_keys?.[
            w.root_sig_key_id
          ];
        if (pub) {
          const sigOk = await ed.verifyAsync(
            Buffer.from(w.root_sig_value_b64, "base64"),
            checkpointSigningMessage(rootHash),
            Buffer.from(pub, "base64"),
          );
          if (!sigOk) {
            findings.push({
              code: "witness_root_sig_invalid",
              message: "Witness root signature invalid",
              record: w.event_id,
            });
          }
        }
      }
      const ts = w.timestamp;
      if (ts?.status === "stamped" && typeof ts.token_b64 === "string" && ts.token_b64) {
        const expected = `sha256:${rootHash.replace(/^sha256:/i, "").toLowerCase()}`;
        if (ts.authority === "local-test-tsa") {
          const token: TimestampToken = {
            alg: "local-test-tsa",
            issued_at: ts.gen_time_utc ?? new Date(0).toISOString(),
            message_hash: ts.message_hash || expected,
            token_b64: ts.token_b64,
          };
          const local = verifyLocalTestTimestamp(token, expected);
          if (!local.ok) {
            findings.push({
              code: "witness_timestamp_invalid",
              message: "Witness root timestamp token invalid",
              record: w.event_id,
            });
          }
        } else {
          const parsed = parseRfc3161Reply(Buffer.from(ts.token_b64, "base64"));
          const imprintOk =
            parsed.ok &&
            `sha256:${parsed.message_hash_hex}` === expected;
          if (!imprintOk) {
            findings.push({
              code: "witness_timestamp_invalid",
              message: "Witness root timestamp token invalid",
              record: w.event_id,
            });
          }
        }
      }
    }
  }

  const hard = findings.filter((f) => f.code !== "demo_clock");
  const ok = hard.length === 0;
  const witness = witnessStateFromBundle(bundle);
  const checks = buildVerifyChecks({ ok, findings }, witness, {
    receipts: bundle.receipts,
    approvals: Array.isArray(bundle.approvals) ? bundle.approvals : [],
    trusted_time: trustedTime,
    witness_label: witnessLabelFromBundle(bundle),
    witness_anchoring_type: Array.isArray(bundle.witness)
      ? bundle.witness.find((x) => x?.anchoring_type)?.anchoring_type ?? null
      : null,
  });
  if (provenance) {
    // Reported separately from the record checks: this is about the data's origin, not the seal.
    checks.push({
      id: "source_of_data",
      label: provenance.source_line,
      status: "info",
      detail: provenance.headline,
    });
  }
  return {
    ok,
    message: ok
      ? "The record is intact and signed by a recognised key."
      : "Record check failed. This record cannot be relied on.",
    record_line: ok
      ? provenance?.record_line ??
        `Record intact: signed and unchanged since ${formatUtc(
          bundle.receipts[0]?.issued_at,
        )}`
      : "Record check failed: it was changed after signing, or is incomplete.",
    source_line: provenance?.source_line ?? null,
    provenance,
    checks,
    findings: findings.map((f) => ({
      code: f.code,
      message: plainFindingMessage(f),
      record: f.record,
    })),
    receipts: bundle.receipts.length,
    case_id: bundle.case_id ?? bundle.receipts[0]?.case_id ?? null,
    trace_id: bundle.trace_id ?? null,
    witness,
  };
}

/**
 * The receipt key this process signs with, as key_id -> public key (base64).
 * KMS: GetPublicKey (cached by the signer). Software: derived from the seed.
 * In production the DEV_SIGNING_PRIVATE_KEY_B64 fallback is ignored. Never
 * throws: an unreachable KMS just yields no entry (the DB copy still pins it).
 */
export async function configuredReceiptKey(): Promise<Record<string, string>> {
  const kms = getReceiptKmsSigner();
  if (kms) {
    try {
      return { [receiptKeyIdFromEnv()]: await kms.getPublicKeyB64() };
    } catch {
      return {};
    }
  }
  const seedB64 =
    process.env.AEGIS_RECEIPT_SIGNING_KEY_B64?.trim() ||
    (isProductionEnv() ? undefined : process.env.DEV_SIGNING_PRIVATE_KEY_B64?.trim());
  if (!seedB64) return {};
  const seed = Buffer.from(seedB64, "base64");
  if (seed.length !== 32) return {};
  return {
    [receiptKeyIdFromEnv()]: Buffer.from(await ed.getPublicKeyAsync(seed)).toString(
      "base64",
    ),
  };
}

/** Public keys Aegis itself published (env receipt key). Used to pin bundle keys. */
export async function trustedReceiptKeysFromEnv(): Promise<Record<string, string>> {
  return configuredReceiptKey();
}

/**
 * Env key plus every key recorded in receipt_signing_key (including retired
 * keys, so old bundles keep verifying). DB is best-effort: the public verify
 * route works without a database.
 */
export async function trustedReceiptKeys(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (process.env.DATABASE_URL) {
    try {
      for (const k of await listPublishedReceiptKeys(getPool())) {
        out[k.key_id] = k.public_key_b64;
      }
    } catch {
      /* older DB without receipt_signing_key, or DB down */
    }
  }
  // The key this process signs with wins over a stale row for the same id.
  return { ...out, ...(await configuredReceiptKey()) };
}

export function evidenceBundleFilename(
  bundle: { trace_id: string; case_id?: string | null },
  ext: "json" | "pdf",
): string {
  const id = (bundle.case_id ?? bundle.trace_id).replace(/[^A-Za-z0-9_-]/g, "_");
  return `aegis-evidence-${id.slice(0, 40)}.${ext}`;
}

/* ------------------------------ DB loading ------------------------------ */

async function receiptPublicKeys(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  keyIds: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const wanted = new Set(keyIds);
  const envKey = await configuredReceiptKey();
  for (const [id, pub] of Object.entries(envKey)) {
    if (wanted.has(id)) out[id] = pub;
  }
  // Published receipt keys (KMS / retired keys), no KMS round trip needed.
  const stillMissing = [...wanted].filter((k) => !out[k]);
  if (stillMissing.length > 0) {
    try {
      for (const k of await listPublishedReceiptKeys(client)) {
        if (wanted.has(k.key_id) && !out[k.key_id]) out[k.key_id] = k.public_key_b64;
      }
    } catch {
      /* older DB without receipt_signing_key */
    }
  }
  const missing = [...wanted].filter((k) => !out[k]);
  if (missing.length > 0) {
    const rows = await client.query<{ key_id: string; public_key_b64: string }>(
      `SELECT key_id, public_key_b64 FROM signing_key
       WHERE organization_id = $1 AND key_id = ANY($2::text[])`,
      [organizationId, missing],
    );
    for (const r of rows.rows) out[r.key_id] = r.public_key_b64;
  }
  return out;
}

type ReceiptRow = {
  receipt_id: string;
  seq: string;
  prev_hash: string | null;
  receipt_hash: string;
  key_id: string;
  sig_alg: string;
  sig_value_b64: string;
  body: Record<string, unknown> | null;
};

export function receiptFromRow(row: ReceiptRow): SignedForensicReceipt {
  const body =
    row.body && typeof row.body === "object" && !Array.isArray(row.body)
      ? row.body
      : {};
  return {
    ...(body as unknown as SignedForensicReceipt),
    receipt_id: row.receipt_id,
    seq: Number(row.seq),
    prev_hash: row.prev_hash,
    receipt_hash: row.receipt_hash,
    key_id: row.key_id,
    sig_alg: row.sig_alg as "ed25519",
    sig_value_b64: row.sig_value_b64,
  };
}

/** Collect AEGIS-SRC1 key_ids referenced by receipt source envelopes. */
export function sourceKeyIdsFromReceipts(
  receipts: SignedForensicReceipt[],
): string[] {
  const ids = new Set<string>();
  for (const r of receipts) {
    const env = extractSourceEnvelope(r);
    if (env && typeof env.key_id === "string" && env.key_id) {
      ids.add(env.key_id);
    }
  }
  return [...ids];
}

/**
 * Load source_keys + source_registry for envelopes cited by the receipts.
 * Resolves key_ids via source_key; expands to sibling keys of the same sources
 * that appear in source_registry_event history for the org.
 */
async function loadSourceKeysForReceipts(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  receipts: SignedForensicReceipt[],
): Promise<{
  source_keys?: Record<string, string>;
  source_registry?: SourceRegistryEntry[];
}> {
  const keyIds = sourceKeyIdsFromReceipts(receipts);
  if (keyIds.length === 0) return {};
  try {
    const keys = await client.query<{
      key_id: string;
      source_id: string;
      public_key_b64: string;
      valid_from: Date;
      valid_to: Date | null;
      status: string;
    }>(
      `WITH referenced AS (
         SELECT DISTINCT source_id
         FROM source_key
         WHERE organization_id = $1 AND key_id = ANY($2::text[])
         UNION
         SELECT DISTINCT source_id
         FROM source_registry_event
         WHERE organization_id = $1 AND key_id = ANY($2::text[])
       )
       SELECT sk.key_id, sk.source_id, sk.public_key_b64, sk.valid_from, sk.valid_to, sk.status
       FROM source_key sk
       JOIN referenced r ON r.source_id = sk.source_id
       WHERE sk.organization_id = $1
       ORDER BY sk.created_at ASC, sk.key_id`,
      [organizationId, keyIds],
    );

    if (keys.rows.length === 0) return {};
    const source_keys: Record<string, string> = {};
    const source_registry: SourceRegistryEntry[] = [];
    for (const row of keys.rows) {
      source_keys[row.key_id] = row.public_key_b64;
      source_registry.push({
        key_id: row.key_id,
        source_id: row.source_id,
        public_key_b64: row.public_key_b64,
        valid_from: row.valid_from.toISOString(),
        valid_to: row.valid_to ? row.valid_to.toISOString() : null,
        status: row.status,
      });
    }
    return { source_keys, source_registry };
  } catch {
    // Older DB without source tables.
    return {};
  }
}

/**
 * Load everything for one trace (scoped to the org) and build the bundle.
 * Returns null when the trace has no signed receipt.
 */
export async function loadEvidenceBundle(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  traceId: string,
): Promise<EvidenceBundle | null> {
  const events = await client.query<{
    event_id: string;
    event_hash: string;
    sequence_num: string;
    prev_event_hash: string | null;
    key_id: string | null;
    sig_alg: string | null;
    sig_value_b64: string | null;
    emitted_at: Date;
    payload: Record<string, unknown> | null;
  }>(
    `SELECT event_id, event_hash, sequence_num::text, prev_event_hash, key_id,
            sig_alg, sig_value_b64, emitted_at, payload
     FROM event
     WHERE organization_id = $1 AND trace_id = $2
     ORDER BY sequence_num ASC`,
    [organizationId, traceId],
  );

  const eventIds = events.rows.map((e) => e.event_id);
  const caseIds = new Set<string>();
  for (const e of events.rows) {
    const cid = e.payload?.case_id;
    if (typeof cid === "string" && cid) caseIds.add(cid);
  }
  try {
    const cases = await client.query<{ case_id: string }>(
      `SELECT case_id FROM bank_case
       WHERE organization_id = $1 AND trace_id = $2`,
      [organizationId, traceId],
    );
    for (const c of cases.rows) caseIds.add(c.case_id);
  } catch {
    // bank_case absent on older DBs
  }

  const rows = await client.query<ReceiptRow>(
    `SELECT receipt_id, seq::text, prev_hash, receipt_hash, key_id, sig_alg,
            sig_value_b64, body
     FROM forensic_receipt
     WHERE organization_id = $1
       AND (
         case_id = ANY($2::text[])
         OR EXISTS (
           SELECT 1
           FROM jsonb_array_elements(COALESCE(body->'sealed_events', '[]'::jsonb)) se
           WHERE se->>'event_id' = ANY($3::text[])
         )
       )
     ORDER BY seq ASC`,
    [organizationId, [...caseIds], eventIds],
  );
  if (rows.rows.length === 0) return null;
  const receipts = rows.rows.map(receiptFromRow);

  const keys = await receiptPublicKeys(
    client,
    organizationId,
    [...new Set(receipts.map((r) => r.key_id))],
  );
  // A5: include the witness checkpoint public key so root signatures verify offline.
  try {
    const witnessPub = await witnessCheckpointPublicKeyB64();
    if (witnessPub) keys[witnessCheckpointKeyId()] = witnessPub;
  } catch {
    /* optional */
  }

  let approvals: EvidenceApproval[] = [];
  try {
    const ap = await client.query<{
      approval_id: string;
      status: string;
      created_at: Date;
      decided_at: Date | null;
      metadata: Record<string, unknown> | null;
    }>(
      `SELECT a.approval_id, a.status, a.created_at, a.decided_at, a.metadata
       FROM approval a
       JOIN event e ON e.event_id = a.event_id
       WHERE a.organization_id = $1 AND e.trace_id = $2
       ORDER BY a.created_at ASC`,
      [organizationId, traceId],
    );
    for (const a of ap.rows) {
      let votes: EvidenceApproval["votes"] = [];
      try {
        const v = await client.query<{
          voter_email: string | null;
          decision: string;
          reason: string | null;
          created_at: Date;
        }>(
          `SELECT voter_email, decision, reason, created_at
           FROM approval_vote
           WHERE organization_id = $1 AND approval_id = $2
           ORDER BY created_at ASC`,
          [organizationId, a.approval_id],
        );
        const metaVotes = Array.isArray(a.metadata?.votes)
          ? (a.metadata!.votes as Array<Record<string, unknown>>)
          : [];
        votes = v.rows.map((x) => {
          const mv = metaVotes.find(
            (m) => m.voter_email === x.voter_email && m.decision === x.decision,
          );
          const d = mv?.delegation as
            | {
                role_key?: string;
                expires_at?: string;
                delegate?: { name?: string | null };
                delegator?: { name?: string | null; email?: string | null };
              }
            | undefined;
          return {
            voter_email: x.voter_email,
            decision: x.decision,
            reason: x.reason,
            at_utc: iso(x.created_at),
            ...(d
              ? {
                  delegation: {
                    acted_by_name: d.delegate?.name ?? null,
                    delegated_by_name: d.delegator?.name ?? null,
                    delegated_by_email: d.delegator?.email ?? null,
                    role_key: d.role_key ?? "",
                    expires_at_utc: d.expires_at ?? null,
                  },
                }
              : {}),
          };
        });
      } catch {
        votes = [];
      }
      approvals.push({
        approval_id: a.approval_id,
        status: a.status,
        requested_at_utc: iso(a.created_at),
        decided_at_utc: iso(a.decided_at),
        required_role:
          typeof a.metadata?.required_role === "string"
            ? a.metadata.required_role
            : null,
        votes,
      });
    }
  } catch {
    approvals = [];
  }

  const cited = new Set(
    receipts.flatMap((r) => (r.sealed_events ?? []).map((e) => e.event_id)),
  );
  let witness: EvidenceWitness[] | null = null;
  try {
    const w: EvidenceWitness[] = [];
    for (const id of cited) {
      if (id.startsWith("evt_gov_")) continue;
      const proof = await getInclusionProofByEvent(client, organizationId, id);
      if (!proof) {
        w.push({
          event_id: id,
          status: "pending",
          label: witnessCheckpointLabel("internal"),
        });
        continue;
      }
      w.push({
        event_id: id,
        status: "included",
        label: witnessCheckpointLabel(proof.anchoring_type),
        proof_id: proof.proof_id,
        root_id: proof.root_id,
        root_hash: proof.root_hash,
        leaf_index: proof.leaf_index,
        tree_size: proof.tree_size,
        merkle_path: proof.merkle_path,
        root_sig_value_b64: proof.sig_value_b64,
        root_sig_key_id: proof.sig_key_id,
        anchoring_type: proof.anchoring_type,
        external_tx_id: proof.external_tx_id,
        timestamp: proof.timestamp
          ? {
              status: proof.timestamp.status,
              authority: proof.timestamp.authority,
              gen_time_utc: proof.timestamp.gen_time_utc,
              tsa_url: proof.timestamp.tsa_url,
              message_hash: proof.timestamp.message_hash,
              token_b64: proof.timestamp.token_b64,
            }
          : null,
      });
    }
    witness = w.length > 0 ? w : null;
  } catch {
    witness = null;
  }

  let key_custody: Record<string, EvidenceKeyCustody> | undefined;
  try {
    const published = await listPublishedReceiptKeys(client);
    key_custody = {};
    for (const k of published) {
      key_custody[k.key_id] = {
        custody: k.custody,
        label: custodyLabel(k.custody),
        status: k.status,
      };
    }
  } catch {
    key_custody = undefined;
  }

  let trusted_time: EvidenceTrustedTime[] | null = null;
  try {
    const stamps: ReceiptTimestamp[] = await getReceiptTimestamps(
      client,
      organizationId,
      receipts.map((r) => r.receipt_id),
    );
    trusted_time =
      stamps.length > 0
        ? stamps.map((s) => ({
            receipt_id: s.receipt_id,
            status: s.status,
            authority: s.authority,
            gen_time_utc: s.gen_time_utc,
            tsa_url: s.tsa_url,
            message_hash: s.message_hash,
            token_b64: s.token_b64,
          }))
        : null;
  } catch {
    trusted_time = null;
  }

  const { source_keys, source_registry } = await loadSourceKeysForReceipts(
    client,
    organizationId,
    receipts,
  );

  const caseIdForTokens = receipts[0]?.case_id ?? [...caseIds][0] ?? null;
  let decision_tokens: Array<Record<string, unknown>> | undefined;
  let decision_keys: Record<string, string> | undefined;
  if (caseIdForTokens) {
    try {
      const tokenRows = await client.query<{
        token_body: Record<string, unknown>;
        key_id: string;
      }>(
        `SELECT token_body, key_id FROM decision_token
         WHERE organization_id = $1 AND case_id = $2
         ORDER BY issued_at ASC`,
        [organizationId, caseIdForTokens],
      );
      if (tokenRows.rows.length > 0) {
        decision_tokens = tokenRows.rows.map((r) => r.token_body);
        decision_keys = { ...keys };
        for (const r of tokenRows.rows) {
          if (keys[r.key_id]) decision_keys[r.key_id] = keys[r.key_id]!;
        }
      }
    } catch {
      /* migration 008 not applied yet */
    }
  }

  const bundle = buildEvidenceBundle({
    organization_id: organizationId,
    trace_id: traceId,
    case_id: caseIdForTokens,
    receipts,
    sealed_events: events.rows
      .filter((e) => cited.has(e.event_id))
      .map((e) => ({
        event_id: e.event_id,
        event_hash: e.event_hash,
        sequence_num: Number(e.sequence_num),
        prev_event_hash: e.prev_event_hash,
        key_id: e.key_id ?? undefined,
        sig_alg: e.sig_alg ?? undefined,
        sig_value_b64: e.sig_value_b64 ?? undefined,
        emitted_at: e.emitted_at,
        payload: e.payload,
      })),
    keys,
    source_keys,
    source_registry,
    decision_keys,
    decision_tokens,
    key_custody,
    trusted_time,
    approvals,
    witness,
  });
  const check = await verifyForensicBundle(bundle);
  bundle.export_check = {
    ok: check.ok,
    findings: check.findings.map((f) => plainFindingMessage(f)),
  };
  return bundle;
}

/* --------------------------------- PDF ---------------------------------- */

function formatUtc(isoText: string | null | undefined): string {
  if (!isoText) return "n/a";
  const d = new Date(isoText);
  if (Number.isNaN(d.getTime())) return isoText;
  return `${d.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

/** "Trusted time: <authority> at <UTC>", or the pending / not-configured wording. */
export function trustedTimeText(
  bundle: { receipts: SignedForensicReceipt[]; trusted_time?: EvidenceTrustedTime[] | null },
  receiptId: string,
): string {
  const entry = readTrustedTime(bundle).find((t) => t.receipt_id === receiptId);
  if (!entry) {
    return "Trusted time: not stamped by an outside authority (signing time only)";
  }
  if (entry.status === "stamped") {
    return `Trusted time: ${entry.authority ?? "time authority"} at ${formatUtc(entry.gen_time_utc)}`;
  }
  if (entry.status === "invalid") {
    return "Trusted time: stamp does not match this record";
  }
  return "Trusted time: pending (the time authority has not stamped this record yet)";
}

/** One-page plain-facts PDF for the first (primary) receipt in the bundle. */
export async function renderEvidencePdf(bundle: EvidenceBundle): Promise<Buffer> {
  const verification = await verifyForensicBundle(bundle);
  const checks = buildVerifyChecks(verification, witnessStateFromBundle(bundle));
  // The page describes the decision, not a later grade-change receipt.
  const decisionEvidence = bundle.evidence.filter(
    (e) => e.outcome !== GRADE_CHANGE_OUTCOME,
  );
  const primary =
    decisionEvidence[decisionEvidence.length - 1] ??
    bundle.evidence[bundle.evidence.length - 1];
  const receipt =
    bundle.receipts.find((r) => r.receipt_id === primary?.receipt_id) ??
    bundle.receipts[bundle.receipts.length - 1];
  const provenance = buildCaseProvenance(bundle.receipts);
  const lines: PdfLine[] = [];
  lines.push({ text: "Aegis evidence record", bold: true, size: 18 });
  lines.push({
    text: "Plain facts from the signed record. The signed file (evidence bundle) is the proof.",
    size: 9,
  });

  if (!primary || !receipt) {
    lines.push({ text: "No signed receipt found for this case.", gapBefore: 12 });
    return renderOnePagePdf(lines, "Aegis evidence record");
  }

  lines.push({ text: "What happened", bold: true, size: 12, gapBefore: 12 });
  lines.push({ text: primary.plain_summary });

  const { amount, currency } = attrAmount(receipt.attributes);
  const pdfAttrs =
    receipt.attributes && typeof receipt.attributes === "object"
      ? (receipt.attributes as Record<string, unknown>)
      : {};
  const requesterLine =
    (typeof pdfAttrs.requester === "string" && pdfAttrs.requester.trim()) ||
    (typeof pdfAttrs.requester_name === "string"
      ? formatApprover(
          pdfAttrs.requester_name,
          typeof pdfAttrs.requester_role === "string"
            ? pdfAttrs.requester_role
            : null,
        )
      : null) ||
    (pdfAttrs.requester_missing === true ? "Not recorded" : null);
  lines.push({ text: "Facts", bold: true, size: 12, gapBefore: 10 });
  const facts: Array<[string, string]> = [
    ["Case", bundle.case_id ?? bundle.trace_id],
    ["Outcome", primary.outcome.toUpperCase()],
    [
      "Amount",
      amount != null
        ? currency?.trim()
          ? `${currency.trim().toUpperCase()} ${Math.round(amount).toLocaleString("en-US")}`
          : Math.round(amount).toLocaleString("en-US")
        : "n/a",
    ],
    [
      "Rule(s)",
      primary.matched_rules
        .map((m) => formatRuleLabel(m.rule_id) ?? null)
        .filter((x): x is string => Boolean(x))
        .join(", ") || "none matched",
    ],
    [
      "Policy",
      primary.policy
        ? `v${primary.policy.version}` +
          (primary.policy.content_hash ? ` (${primary.policy.content_hash})` : "")
        : "n/a",
    ],
    ...(requesterLine ? ([["Requested by", requesterLine]] as Array<[string, string]>) : []),
    ["Who approved", primary.who_approved],
    ["Recorded at", formatUtc(primary.issued_at_utc)],
    ["Mode", receipt.mode === "record_only" ? "Record only (not blocking)" : "Enforced"],
  ];
  for (const [k, v] of facts) lines.push({ text: `${k}: ${v}` });

  // Stage 2: where the data came from. Never implies the data is accurate.
  if (provenance) {
    lines.push({ text: "Where this data came from", bold: true, size: 12, gapBefore: 10 });
    lines.push({ text: provenance.headline, size: 9 });
    lines.push({
      text:
        "Five facts: " +
        provenance.checklist
          .map((item) => `${item.label}: ${item.met ? "yes" : "no"}`)
          .join("; "),
      size: 8,
    });
    for (const change of provenance.grade_changes) {
      lines.push({
        text:
          `Grade rose ${change.from_grade} to ${change.to_grade} at ${formatUtc(change.at)}` +
          `${change.feed_name ? ` (${change.feed_name})` : ""}: ${change.reason}`,
        size: 8,
      });
    }
    lines.push({ text: provenance.limitations, size: 8 });
  }

  // Plain summary is the auditor-facing sentence; skip engine decision_basis text.

  lines.push({ text: "Seal", bold: true, size: 12, gapBefore: 10 });
  lines.push({ text: `Receipt number: ${primary.seq}` });
  lines.push({ text: `Receipt hash: ${primary.receipt_hash}`, size: 8 });
  lines.push({ text: `Previous hash: ${primary.prev_hash ?? "none (first record)"}`, size: 8 });
  lines.push({ text: `Sealed event: ${primary.event_id ?? "n/a"}`, size: 8 });
  lines.push({ text: `Event hash: ${primary.event_hash ?? "n/a"}`, size: 8 });
  lines.push({
    text: `Signed with key ${primary.key_id}, fingerprint ${primary.public_key_fingerprint ?? "unknown"}`,
    size: 8,
  });
  lines.push({ text: `Signature: ${primary.sig_value_b64}`, size: 8 });
  const custody =
    receipt.flags?.key_custody ?? bundle.key_custody?.[primary.key_id]?.custody;
  if (custody) {
    lines.push({ text: custodyLabel(custody), size: 8 });
    if (custody === "software" || custody === "software_interim") {
      lines.push({ text: CUSTODY_PRODUCTION_NOTE, size: 8 });
    }
  }
  lines.push({ text: trustedTimeText(bundle, receipt.receipt_id), size: 8 });

  lines.push({ text: "Checked when this page was made", bold: true, size: 12, gapBefore: 10 });
  lines.push({
    text: verification.ok
      ? (provenance?.record_line ??
        `Record intact: signed and unchanged since ${formatUtc(receipt.issued_at)}`)
      : "Record check failed: it was changed after signing, or is incomplete.",
    size: 9,
  });
  if (provenance) lines.push({ text: provenance.source_line, size: 9 });
  for (const c of checks) {
    const mark =
      c.status === "pass" ? "PASS" : c.status === "fail" ? "FAIL" : c.status === "info" ? "NOTE" : "PENDING";
    lines.push({ text: `[${mark}] ${c.label}` });
  }

  lines.push({ text: "How to verify", bold: true, size: 12, gapBefore: 10 });
  lines.push({
    text:
      "Download the evidence bundle for this case and drop it on the Verify page, or run aegis-verify on it. " +
      "This page is for reading only; it is not independently verifiable.",
    size: 9,
  });
  lines.push({
    text: `Generated ${formatUtc(bundle.generated_at_utc)}`,
    size: 8,
    gapBefore: 6,
  });
  return renderOnePagePdf(lines, "Aegis evidence record");
}
