/**
 * Write tools/independent-verify/fixtures/g1-exported-bundle.json for offline verifiers.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as ed from "@noble/ed25519";
import {
  buildEnvelope,
  generateKeyPair,
  signEnvelope,
} from "@salanor/aegis-sdk";
import {
  buildReceiptBody,
  signForensicReceipt,
} from "../src/forensic/receipt.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const out = join(root, "tools/independent-verify/fixtures/g1-exported-bundle.json");

const privateKey = ed.utils.randomPrivateKey();
const publicKey = await ed.getPublicKeyAsync(privateKey);
const receiptKeys = {
  privateKeyB64: Buffer.from(privateKey).toString("base64"),
  publicKeyB64: Buffer.from(publicKey).toString("base64"),
  keyId: "key_receipt_fixture",
};
const source = await generateKeyPair();
const sourceKeyId = "src1_fixture_key_01";
const ts = "2026-06-01T12:00:00.000Z";

const unsigned = buildEnvelope({
  source_id: "src_los",
  key_id: sourceKeyId,
  seq: 1,
  ts,
  event: {
    event_type: "loan.disbursement.requested",
    amount: "1500.00",
    currency: "RWF",
  },
});
const envelope = await signEnvelope(unsigned, source.privateKey);

const body = buildReceiptBody({
  organization_id: "00000000-0000-0000-0000-000000000001",
  seq: 1,
  prev_hash: null,
  case_id: "case-fixture-1",
  decision_id: "dec-fixture-1",
  outcome: "allow",
  mode: "enforce",
  matched_rules: [],
  sealed_events: [
    { event_id: "evt_1", event_hash: "sha256:abc", sequence_num: 1 },
  ],
  key_id: receiptKeys.keyId,
  attributes: {
    source_envelope: envelope,
    source_id: "src_los",
    source_key_id: sourceKeyId,
    evidence_grade: "G1",
    checks: { source_signed: true },
    provenance: { authentication: "source_signature", grade: "G1" },
  },
});
const signed = await signForensicReceipt(body, receiptKeys.privateKeyB64);

const bundle = {
  format: "aegis-evidence-bundle",
  receipts: [signed],
  sealed_events: body.sealed_events,
  keys: { [receiptKeys.keyId]: receiptKeys.publicKeyB64 },
  source_keys: { [sourceKeyId]: source.publicKeyB64 },
  source_registry: [
    {
      key_id: sourceKeyId,
      source_id: "src_los",
      public_key_b64: source.publicKeyB64,
      valid_from: "2026-01-01T00:00:00.000Z",
      valid_to: null,
      status: "active",
    },
  ],
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(bundle, null, 2)}\n`);
console.log(`wrote ${out}`);
