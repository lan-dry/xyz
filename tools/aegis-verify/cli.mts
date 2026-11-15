#!/usr/bin/env node
/**
 * Offline aegis-verify — verifies forensic receipt bundles and underlying sealed event refs.
 * Usage: aegis-verify <bundle.json> [--keys keys.json]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import * as ed from "@noble/ed25519";

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

type Bundle = {
  receipts: SignedReceipt[];
  sealed_events?: Array<{
    event_id: string;
    event_hash: string;
    sequence_num: number;
  }>;
  checkpoint?: { seq: number; head_hash: string; key_id: string } | null;
  keys?: Record<string, string>;
};

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

  const hard = findings.filter((f) => f.code !== "demo_clock");
  if (hard.length === 0) {
    console.log(`OK ${receipts.length} receipt(s) verified`);
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
