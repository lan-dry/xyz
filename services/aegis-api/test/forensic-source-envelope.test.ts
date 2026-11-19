import { describe, expect, it } from "vitest";
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
import { verifyForensicBundle } from "../src/forensic/verify-bundle.js";

async function receiptKeyPair() {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  return {
    privateKeyB64: Buffer.from(privateKey).toString("base64"),
    publicKeyB64: Buffer.from(publicKey).toString("base64"),
    keyId: "key_receipt_1",
  };
}

describe("forensic source envelope verification", () => {
  it("verifies a bundle with a valid source_envelope; tampering fails", async () => {
    const receiptKeys = await receiptKeyPair();
    const sourceKeys = await generateKeyPair();
    const sourceKeyId = "k_los_2026_01";
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
    const envelope = await signEnvelope(unsigned, sourceKeys.privateKey);

    const body = buildReceiptBody({
      organization_id: "00000000-0000-0000-0000-000000000001",
      seq: 1,
      prev_hash: null,
      case_id: "case-src-1",
      decision_id: "dec-src-1",
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

    const source_registry = [
      {
        key_id: sourceKeyId,
        source_id: "src_los",
        public_key_b64: sourceKeys.publicKeyB64,
        valid_from: "2026-01-01T00:00:00.000Z",
        valid_to: null,
        status: "active",
      },
    ];

    const good = await verifyForensicBundle({
      receipts: [signed],
      sealed_events: [
        { event_id: "evt_1", event_hash: "sha256:abc", sequence_num: 1 },
      ],
      keys: { [receiptKeys.keyId]: receiptKeys.publicKeyB64 },
      source_keys: { [sourceKeyId]: sourceKeys.publicKeyB64 },
      source_registry,
    });
    expect(good.ok).toBe(true);
    expect(good.findings.some((f) => f.code.startsWith("source_"))).toBe(false);

    // Tamper the sealed envelope then re-sign the receipt so only source verify fails.
    const tamperedBody = structuredClone(body);
    const env = tamperedBody.attributes!.source_envelope as {
      event: { amount: string };
    };
    env.event.amount = "9999.00";
    const tamperedReceipt = await signForensicReceipt(
      tamperedBody,
      receiptKeys.privateKeyB64,
    );
    const bad = await verifyForensicBundle({
      receipts: [tamperedReceipt],
      sealed_events: [
        { event_id: "evt_1", event_hash: "sha256:abc", sequence_num: 1 },
      ],
      keys: { [receiptKeys.keyId]: receiptKeys.publicKeyB64 },
      source_keys: { [sourceKeyId]: sourceKeys.publicKeyB64 },
      source_registry,
    });
    expect(bad.ok).toBe(false);
    expect(
      bad.findings.some((f) => f.code === "source_event_hash_mismatch"),
    ).toBe(true);
  });
});
