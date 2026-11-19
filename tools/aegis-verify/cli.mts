#!/usr/bin/env node
/**
 * Offline aegis-verify — verifies forensic receipt bundles and underlying sealed event refs.
 * Usage: aegis-verify <bundle.json> [--keys keys.json]
 *
 * A5: when witness[] includes merkle_path + root, verifies inclusion offline
 * (leaf = event hash; node = SHA-256 of left hex + right hex).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash, createHmac } from "node:crypto";
import * as ed from "@noble/ed25519";
import { verifyEnvelope } from "@salanor/aegis-sdk";
import {
  checkpointSigningMessage,
  verifyMerkleProof,
  type MerklePathStep,
} from "./merkle.ts";

type SignedReceipt = {
  receipt_id: string;
  seq: number;
  prev_hash: string | null;
  receipt_hash: string;
  key_id: string;
  sig_alg: string;
  sig_value_b64: string;
  sealed_events?: Array<{
    event_id: string;
    event_hash: string;
    sequence_num: number;
  }>;
  flags?: { demo_clock?: boolean };
  [key: string]: unknown;
};

type WitnessEntry = {
  event_id: string;
  status?: string;
  root_hash?: string;
  merkle_path?: MerklePathStep[];
  root_sig_value_b64?: string | null;
  root_sig_key_id?: string | null;
  timestamp?: {
    status?: string;
    authority?: string | null;
    message_hash?: string;
    token_b64?: string | null;
    gen_time_utc?: string | null;
  } | null;
};

type SourceRegistryEntry = {
  key_id: string;
  source_id: string;
  public_key_b64: string;
  valid_from: string;
  valid_to: string | null;
  status: string;
};

type Bundle = {
  receipts: SignedReceipt[];
  sealed_events?: Array<{
    event_id: string;
    event_hash: string;
    sequence_num: number;
  }>;
  checkpoint?: { seq: number; head_hash: string; key_id: string } | null;
  keys?: Record<string, string>;
  /** AEGIS-SRC1 source keys from the evidence bundle (passed through automatically). */
  source_keys?: Record<string, string>;
  source_registry?: SourceRegistryEntry[];
  witness?: WitnessEntry[] | null;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function extractSourceEnvelope(
  receipt: SignedReceipt,
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

function sourceKeyValidAtTs(
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

const SIG_FIELDS = new Set(["sig_alg", "sig_value_b64", "receipt_hash"]);

function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) sorted[key] = sortValue(obj[key]);
    return sorted;
  }
  return value;
}

function strip(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!SIG_FIELDS.has(k)) out[k] = v;
  }
  return out;
}

function receiptHash(body: Record<string, unknown>): string {
  return `sha256:${createHash("sha256").update(canonicalize(strip(body)), "utf8").digest("hex")}`;
}

function digest(body: Record<string, unknown>, keyId: string): Uint8Array {
  const prefixed = `AEGIS-RECEIPT1\n${keyId}\n${canonicalize(strip(body))}`;
  return createHash("sha256").update(prefixed, "utf8").digest();
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help")) {
    console.log("Usage: aegis-verify <bundle.json> [--keys keys.json]");
    process.exit(args.includes("--help") ? 0 : 1);
  }
  const bundlePath = resolve(args[0]!);
  let keysPath: string | undefined;
  const ki = args.indexOf("--keys");
  if (ki >= 0) keysPath = resolve(args[ki + 1]!);

  const bundle = JSON.parse(readFileSync(bundlePath, "utf8")) as Bundle;
  const keys = {
    ...(bundle.keys ?? {}),
    ...(keysPath
      ? (JSON.parse(readFileSync(keysPath, "utf8")) as Record<string, string>)
      : {}),
  };

  const findings: Array<{ code: string; message: string; record?: string }> = [];
  const receipts = [...(bundle.receipts ?? [])].sort((a, b) => a.seq - b.seq);

  for (let i = 1; i < receipts.length; i++) {
    if (receipts[i]!.seq !== receipts[i - 1]!.seq + 1) {
      findings.push({
        code: "missing_sequence",
        message: `Missing sequence between ${receipts[i - 1]!.seq} and ${receipts[i]!.seq}`,
        record: `seq:${receipts[i - 1]!.seq + 1}`,
      });
    }
  }

  let expectedPrev: string | null = receipts[0]?.prev_hash ?? null;
  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i]!;
    const pub = keys[r.key_id];
    if (!pub) {
      findings.push({
        code: "unknown_key_id",
        message: `Unknown key_id ${r.key_id}`,
        record: r.receipt_id,
      });
      continue;
    }
    const hashOk = receiptHash(r as unknown as Record<string, unknown>) === r.receipt_hash;
    if (!hashOk) {
      findings.push({
        code: "receipt_hash_mismatch",
        message: "Fact tamper: receipt hash mismatch",
        record: r.receipt_id,
      });
    }
    const d = digest(r as unknown as Record<string, unknown>, r.key_id);
    const sigOk = await ed.verifyAsync(
      Buffer.from(r.sig_value_b64, "base64"),
      d,
      Buffer.from(pub, "base64"),
    );
    if (!sigOk && hashOk) {
      findings.push({
        code: "signature_invalid",
        message: "Signature invalid",
        record: r.receipt_id,
      });
    }
    if (i > 0 && r.prev_hash !== expectedPrev) {
      findings.push({
        code: "chain_failure",
        message: "prev_hash chain failure",
        record: r.receipt_id,
      });
    }
    if (r.sealed_events) {
      for (const ref of r.sealed_events) {
        const ev = bundle.sealed_events?.find((e) => e.event_id === ref.event_id);
        if (bundle.sealed_events && !ev) {
          findings.push({
            code: "sealed_event_missing",
            message: `Cited event ${ref.event_id} missing`,
            record: r.receipt_id,
          });
        } else if (ev && ev.event_hash !== ref.event_hash) {
          findings.push({
            code: "sealed_event_hash_mismatch",
            message: `Sealed event hash mismatch for ${ref.event_id}`,
            record: r.receipt_id,
          });
        }
      }
    }
    if (r.flags?.demo_clock) {
      console.warn(`WARN demo_clock=true on ${r.receipt_id}`);
    }

    // AEGIS-SRC1 source envelope (when present); source_keys come from the bundle JSON.
    const sourceEnvelope = extractSourceEnvelope(r);
    if (sourceEnvelope) {
      const sourceKeyId = String(sourceEnvelope.key_id);
      const registry = Array.isArray(bundle.source_registry)
        ? bundle.source_registry
        : undefined;
      const registryEntry = registry?.find((e) => e.key_id === sourceKeyId);
      const sourcePub =
        bundle.source_keys?.[sourceKeyId] ??
        registryEntry?.public_key_b64 ??
        undefined;
      if (!sourcePub) {
        findings.push({
          code: "source_key_missing",
          message: `Source key ${sourceKeyId} not in bundle`,
          record: r.receipt_id,
        });
      } else {
        if (registry && registryEntry) {
          const ts =
            typeof sourceEnvelope.ts === "string" ? sourceEnvelope.ts : "";
          if (!sourceKeyValidAtTs(registryEntry, ts)) {
            findings.push({
              code: "source_key_not_valid_at_ts",
              message: `Source key ${sourceKeyId} was not valid at envelope.ts`,
              record: r.receipt_id,
            });
          }
        }
        const verified = await verifyEnvelope(sourceEnvelope, sourcePub);
        if (!verified.ok) {
          findings.push({
            code:
              verified.reason === "event_hash_mismatch"
                ? "source_event_hash_mismatch"
                : "source_signature_invalid",
            message:
              verified.reason === "event_hash_mismatch"
                ? "Source envelope event_hash does not match event"
                : "Source envelope signature does not verify",
            record: r.receipt_id,
          });
        }
      }
    }

    expectedPrev = r.receipt_hash;
  }

  if (bundle.checkpoint && receipts.length) {
    const head = receipts[receipts.length - 1]!;
    if (
      bundle.checkpoint.seq !== head.seq ||
      bundle.checkpoint.head_hash !== head.receipt_hash
    ) {
      findings.push({
        code: "checkpoint_mismatch",
        message: "Checkpoint does not match head",
      });
    }
  }

  // A1: unsigned approvals / evidence must match signed outcome receipts.
  const softApprovals = Array.isArray((bundle as { approvals?: unknown }).approvals)
    ? ((bundle as { approvals: Array<Record<string, unknown>> }).approvals)
    : [];
  const evidence = Array.isArray((bundle as { evidence?: unknown }).evidence)
    ? ((bundle as { evidence: Array<Record<string, unknown>> }).evidence)
    : [];
  for (const prior of receipts) {
    if (prior.outcome !== "hold" && prior.outcome !== "stop") continue;
    const followOns = receipts.filter((r) => {
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
    const decided = softApprovals.filter(
      (a) => a.status === "approved" || a.status === "rejected",
    );
    if (decided.length > 0 && followOns.length === 0) {
      findings.push({
        code: "approval_binding_mismatch",
        message:
          "Human decision listed without a signed outcome receipt following the hold",
        record: prior.receipt_id,
      });
    }
    for (const outcome of followOns) {
      const sealed = Array.isArray(outcome.approvals) ? outcome.approvals[0] : null;
      if (!sealed || typeof sealed !== "object") continue;
      const s = sealed as Record<string, unknown>;
      for (const soft of softApprovals) {
        if (soft.approval_id !== s.approval_id) continue;
        const votes = Array.isArray(soft.votes) ? soft.votes : [];
        const vote = votes[0] as Record<string, unknown> | undefined;
        if (
          typeof vote?.voter_email === "string" &&
          typeof s.approver_email === "string" &&
          vote.voter_email !== s.approver_email
        ) {
          findings.push({
            code: "approval_binding_mismatch",
            message: "Approver does not match signed outcome receipt",
            record: String(outcome.receipt_id),
          });
        }
        if (
          typeof vote?.reason === "string" &&
          typeof s.reason === "string" &&
          vote.reason !== s.reason
        ) {
          findings.push({
            code: "approval_binding_mismatch",
            message: "Reason does not match signed outcome receipt",
            record: String(outcome.receipt_id),
          });
        }
      }
    }
  }
  for (const ev of evidence) {
    const r = receipts.find((x) => x.receipt_id === ev.receipt_id);
    if (!r) continue;
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
        message: "Plain summary does not match signed outcome receipt",
        record: String(r.receipt_id),
      });
    }
  }

  // A5: offline Merkle inclusion when the bundle carries a complete witness proof.
  // Pre-A5 bundles without merkle_path still verify (no hard failure).
  const witness = Array.isArray(bundle.witness) ? bundle.witness : [];
  let inclusionChecked = 0;
  for (const w of witness) {
    if (!w || w.status !== "included") continue;
    if (!Array.isArray(w.merkle_path) || typeof w.root_hash !== "string") continue;
    const sealed =
      bundle.sealed_events?.find((e) => e.event_id === w.event_id) ??
      receipts
        .flatMap((r) => r.sealed_events ?? [])
        .find((e) => e.event_id === w.event_id);
    if (!sealed?.event_hash) continue;
    inclusionChecked += 1;
    if (!verifyMerkleProof(sealed.event_hash, w.root_hash, w.merkle_path)) {
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
      const pub = keys[w.root_sig_key_id];
      if (pub) {
        const sigOk = await ed.verifyAsync(
          Buffer.from(w.root_sig_value_b64, "base64"),
          checkpointSigningMessage(w.root_hash),
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
    if (
      ts?.status === "stamped" &&
      typeof ts.token_b64 === "string" &&
      ts.token_b64 &&
      ts.authority === "local-test-tsa" &&
      typeof ts.message_hash === "string" &&
      typeof ts.gen_time_utc === "string"
    ) {
      const expected = `sha256:${w.root_hash.replace(/^sha256:/i, "").toLowerCase()}`;
      const material = `${ts.message_hash}|${ts.gen_time_utc}`;
      const mac = createHmac("sha256", "aegis-local-test-tsa")
        .update(material, "utf8")
        .digest("base64");
      if (mac !== ts.token_b64 || ts.message_hash !== expected) {
        findings.push({
          code: "witness_timestamp_invalid",
          message: "Witness root timestamp token invalid",
          record: w.event_id,
        });
      }
    }
  }

  const hard = findings.filter((f) => f.code !== "demo_clock");
  if (hard.length === 0) {
    const extra =
      inclusionChecked > 0
        ? ` · ${inclusionChecked} witness inclusion(s) verified offline`
        : "";
    console.log(`OK ${receipts.length} receipt(s) verified${extra}`);
    process.exit(0);
  }
  console.error("FAIL");
  for (const f of hard) {
    console.error(`- [${f.code}] ${f.message}${f.record ? ` (${f.record})` : ""}`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
