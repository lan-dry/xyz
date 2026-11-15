import { describe, expect, it } from "vitest";
import * as ed from "@noble/ed25519";
import {
  buildReceiptBody,
  signForensicReceipt,
  verifyForensicReceiptSignature,
} from "../src/forensic/receipt.js";
import { verifyForensicBundle } from "../src/forensic/verify-bundle.js";

async function keyPair() {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  return {
    privateKeyB64: Buffer.from(privateKey).toString("base64"),
    publicKeyB64: Buffer.from(publicKey).toString("base64"),
    keyId: "key_test_1",
  };
}

describe("forensic receipt", () => {
  it("signs and verifies; cites sealed events", async () => {
    const keys = await keyPair();
    const body = buildReceiptBody({
      organization_id: "00000000-0000-0000-0000-000000000001",
      seq: 1,
      prev_hash: null,
      case_id: "case-1",
      decision_id: "dec-1",
      outcome: "allow",
      mode: "enforce",
      matched_rules: [
        { rule_id: "AUTH-RL", policy_id: "pol_v3", decision: "allow" },
      ],
      sealed_events: [
        {
          event_id: "evt_1",
          event_hash: "sha256:abc",
          sequence_num: 1,
        },
      ],
      policy: {
        policy_id: "pol_v3",
        version: 3,
        content_hash: "deadbeef",
      },
      key_id: keys.keyId,
    });
    const signed = await signForensicReceipt(body, keys.privateKeyB64);
    expect(await verifyForensicReceiptSignature(signed, keys.publicKeyB64)).toBe(
      true,
    );
    expect(signed.sealed_events[0]?.event_hash).toBe("sha256:abc");
  });

  it("scenario 12 tamper matrix", async () => {
    const keys = await keyPair();
    const sealed = [
      { event_id: "evt_1", event_hash: "sha256:aaa", sequence_num: 1 },
      { event_id: "evt_2", event_hash: "sha256:bbb", sequence_num: 2 },
      { event_id: "evt_3", event_hash: "sha256:ccc", sequence_num: 3 },
      { event_id: "evt_4", event_hash: "sha256:ddd", sequence_num: 4 },
      { event_id: "evt_5", event_hash: "sha256:eee", sequence_num: 5 },
    ];

    const receipts = [];
    let prev: string | null = null;
    for (let i = 0; i < 5; i++) {
      const body = buildReceiptBody({
        organization_id: "00000000-0000-0000-0000-000000000001",
        seq: i + 1,
        prev_hash: prev,
        case_id: `case-${i + 1}`,
        decision_id: `dec-${i + 1}`,
        outcome: "allow",
        mode: "enforce",
        matched_rules: [],
        sealed_events: [sealed[i]!],
        key_id: keys.keyId,
      });
      const signed = await signForensicReceipt(body, keys.privateKeyB64);
      receipts.push(signed);
      prev = signed.receipt_hash;
    }

    const keysMap = { [keys.keyId]: keys.publicKeyB64 };
    const good = await verifyForensicBundle({
      receipts,
      sealed_events: sealed,
      keys: keysMap,
      checkpoint: {
        seq: 5,
        head_hash: receipts[4]!.receipt_hash,
        key_id: keys.keyId,
      },
    });
    expect(good.ok).toBe(true);

    // fact change
    const factTamper = structuredClone(receipts);
    factTamper[0]!.outcome = "stop";
    const f1 = await verifyForensicBundle({
      receipts: factTamper,
      sealed_events: sealed,
      keys: keysMap,
    });
    expect(f1.ok).toBe(false);
    expect(f1.findings.some((x) => x.record === factTamper[0]!.receipt_id)).toBe(
      true,
    );

    // signature change (flip one base64 char while keeping length)
    const sigTamper = structuredClone(receipts);
    const sig = Buffer.from(sigTamper[1]!.sig_value_b64, "base64");
    sig[0] = sig[0]! ^ 0xff;
    sigTamper[1]!.sig_value_b64 = Buffer.from(sig).toString("base64");
    const f2 = await verifyForensicBundle({
      receipts: sigTamper,
      sealed_events: sealed,
      keys: keysMap,
    });
    expect(f2.ok).toBe(false);
    expect(f2.findings.some((x) => x.record === sigTamper[1]!.receipt_id)).toBe(
      true,
    );

    // wrong key_id
    const wrongKey = structuredClone(receipts);
    wrongKey[2]!.key_id = "key_wrong";
    const f3 = await verifyForensicBundle({
      receipts: wrongKey,
      sealed_events: sealed,
      keys: { ...keysMap, key_wrong: keys.publicKeyB64 },
    });
    expect(f3.ok).toBe(false);

    // unknown key_id
    const unknownKey = structuredClone(receipts);
    unknownKey[2]!.key_id = "key_unknown";
    const f4 = await verifyForensicBundle({
      receipts: unknownKey,
      sealed_events: sealed,
      keys: keysMap,
    });
    expect(f4.ok).toBe(false);
    expect(f4.findings.some((x) => x.code === "unknown_key_id")).toBe(true);

    // record removed
    const removed = [receipts[0]!, receipts[1]!, receipts[3]!, receipts[4]!];
    const f5 = await verifyForensicBundle({
      receipts: removed,
      sealed_events: sealed,
      keys: keysMap,
    });
    expect(f5.ok).toBe(false);
    expect(f5.findings.some((x) => x.code === "missing_sequence")).toBe(true);

    // swapped
    const swapped = [
      receipts[0]!,
      receipts[2]!,
      receipts[1]!,
      receipts[3]!,
      receipts[4]!,
    ];
    const f6 = await verifyForensicBundle({
      receipts: swapped,
      sealed_events: sealed,
      keys: keysMap,
    });
    expect(f6.ok).toBe(false);
    expect(
      f6.findings.some(
        (x) => x.code === "chain_failure" || x.code === "missing_sequence",
      ),
    ).toBe(true);

    // modified prev_hash
    const prevTamper = structuredClone(receipts);
    prevTamper[3]!.prev_hash = "sha256:deadbeef";
    const f7 = await verifyForensicBundle({
      receipts: prevTamper,
      sealed_events: sealed,
      keys: keysMap,
    });
    expect(f7.ok).toBe(false);
    expect(f7.findings.some((x) => x.code === "chain_failure")).toBe(true);

    // checkpoint mismatch
    const f8 = await verifyForensicBundle({
      receipts,
      sealed_events: sealed,
      keys: keysMap,
      checkpoint: {
        seq: 5,
        head_hash: "sha256:not-the-head",
        key_id: keys.keyId,
      },
    });
    expect(f8.ok).toBe(false);
    expect(f8.findings.some((x) => x.code === "checkpoint_mismatch")).toBe(true);

    // retired key still verifies old receipts when present in keyset
    const retired = await verifyForensicBundle({
      receipts,
      sealed_events: sealed,
      keys: keysMap,
    });
    expect(retired.ok).toBe(true);
  });
});
