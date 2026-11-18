import { describe, expect, it } from "vitest";
import * as ed from "@noble/ed25519";
import {
  buildReceiptBody,
  signForensicReceipt,
  type SignedForensicReceipt,
} from "../src/forensic/receipt.js";
import { verifyForensicBundle } from "../src/forensic/verify-bundle.js";
import {
  buildEvidenceBundle,
  evidenceBundleFilename,
  publicKeyFingerprint,
  renderEvidencePdf,
  verifyBundleFile,
} from "../src/forensic/evidence-bundle.js";
import { renderOnePagePdf, wrapText } from "../src/forensic/minimal-pdf.js";
import {
  buildMerkleTree,
  getMerkleProof,
} from "@salanor/witness-merkle";
import {
  buildVerifyChecks,
  witnessLabelFromBundle,
} from "../src/forensic/verify-messages.js";
import { witnessCheckpointLabel } from "../src/witness/label.js";
import {
  createLocalTestTimestamp,
} from "../src/forensic/rfc3161.js";
import { signWitnessCheckpoint } from "../src/witness/sign-checkpoint.js";

const ORG = "00000000-0000-0000-0000-000000000001";

async function keyPair() {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  return {
    privateKeyB64: Buffer.from(privateKey).toString("base64"),
    publicKeyB64: Buffer.from(publicKey).toString("base64"),
    keyId: "key_test_1",
  };
}

async function chain(n: number, keys: Awaited<ReturnType<typeof keyPair>>) {
  const receipts: SignedForensicReceipt[] = [];
  const sealed = [];
  let prev: string | null = null;
  for (let i = 1; i <= n; i++) {
    const ref = {
      event_id: `evt_${i}`,
      event_hash: `sha256:evt${i}`,
      sequence_num: i,
    };
    sealed.push({ ...ref, emitted_at: new Date("2026-03-01T10:00:00.000Z") });
    const body = buildReceiptBody({
      organization_id: ORG,
      seq: i,
      prev_hash: prev,
      case_id: `case-${i}`,
      decision_id: `dec-${i}`,
      product: "retail_loan",
      event_type: "loan_decision",
      outcome: "allow",
      mode: "enforce",
      policy: { policy_id: "pol_v3", version: 3, content_hash: "sha256:abc" },
      matched_rules: [{ rule_id: "AUTH-RL-1", policy_id: "pol_v3", decision: "allow" }],
      decision_basis: {
        outcome: "allow",
        decided_by_rule_id: "AUTH-RL-1",
        explanation: "Within the officer limit.",
        matched: [],
      },
      sealed_events: [ref],
      attributes: { amount: 1_200_000, currency: "RWF" },
      key_id: keys.keyId,
      issued_at: "2026-03-01T10:00:01.000Z",
    });
    const signed = await signForensicReceipt(body, keys.privateKeyB64);
    receipts.push(signed);
    prev = signed.receipt_hash;
  }
  return { receipts, sealed };
}

describe("evidence bundle", () => {
  it("contains everything a reviewer needs and verifies with verifyForensicBundle", async () => {
    const keys = await keyPair();
    const { receipts, sealed } = await chain(1, keys);
    const bundle = buildEvidenceBundle({
      organization_id: ORG,
      trace_id: "tr_1",
      receipts,
      sealed_events: sealed,
      keys: { [keys.keyId]: keys.publicKeyB64 },
      witness: [{ event_id: "evt_1", status: "pending" }],
    });

    const ev = bundle.evidence[0]!;
    expect(ev.canonical_payload).toContain('"case_id":"case-1"');
    expect(ev.canonical_payload).not.toContain("sig_value_b64");
    expect(ev.receipt_hash).toBe(receipts[0]!.receipt_hash);
    expect(ev.event_hash).toBe("sha256:evt1");
    expect(ev.prev_hash).toBeNull();
    expect(ev.seq).toBe(1);
    expect(ev.sig_value_b64).toBe(receipts[0]!.sig_value_b64);
    expect(ev.key_id).toBe(keys.keyId);
    expect(ev.public_key_fingerprint).toBe(publicKeyFingerprint(keys.publicKeyB64));
    expect(ev.public_key_fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(ev.issued_at_utc).toBe("2026-03-01T10:00:01.000Z");
    expect(ev.event_emitted_at_utc).toBe("2026-03-01T10:00:00.000Z");
    expect(ev.policy).toEqual({ policy_id: "pol_v3", version: 3, content_hash: "sha256:abc" });
    expect(ev.matched_rules[0]?.rule_id).toBe("AUTH-RL-1");
    expect(ev.decision_basis?.explanation).toMatch(/officer limit/);
    expect(ev.who_approved).toBe(
      "No approval needed: allowed automatically by rule AUTH-RL-1 · Within officer limit.",
    );
    expect(bundle.witness).toEqual([{ event_id: "evt_1", status: "pending" }]);
    expect(bundle.how_to_verify).toMatch(/AEGIS-RECEIPT1/);
    expect(evidenceBundleFilename(bundle, "pdf")).toBe("aegis-evidence-case-1.pdf");

    // The bundle object itself is a ForensicBundle.
    const verdict = await verifyForensicBundle(bundle);
    expect(verdict.ok).toBe(true);
  });

  it("verifies from the downloaded JSON text and fails when one byte changes", async () => {
    const keys = await keyPair();
    const { receipts, sealed } = await chain(1, keys);
    const bundle = buildEvidenceBundle({
      organization_id: ORG,
      trace_id: "tr_1",
      receipts,
      sealed_events: sealed,
      keys: { [keys.keyId]: keys.publicKeyB64 },
    });
    const text = JSON.stringify(bundle, null, 2);

    const good = await verifyBundleFile(JSON.parse(text));
    expect(good.ok).toBe(true);
    expect(good.checks.filter((c) => c.status === "fail")).toHaveLength(0);

    // Change one character of a signed fact (first match is inside receipts[]).
    const marker = '"outcome": "allow"';
    const at = text.indexOf(marker);
    expect(at).toBeGreaterThan(-1);
    const tampered = text.slice(0, at) + '"outcome": "allox"' + text.slice(at + marker.length);
    expect(tampered.length).toBe(text.length);
    const bad = await verifyBundleFile(JSON.parse(tampered));
    expect(bad.ok).toBe(false);
    expect(bad.findings.some((f) => f.code === "receipt_hash_mismatch")).toBe(true);
    expect(bad.findings[0]!.message).toMatch(/changed after it was signed/);
    expect(bad.checks.find((c) => c.id === "facts")?.status).toBe("fail");

    // Edit only the readable summary: still caught.
    const edited = structuredClone(bundle);
    edited.evidence[0]!.canonical_payload = edited.evidence[0]!.canonical_payload.replace(
      "1200000",
      "9200000",
    );
    const bad2 = await verifyBundleFile(edited);
    expect(bad2.ok).toBe(false);
    expect(bad2.findings.some((f) => f.code === "summary_mismatch")).toBe(true);
  });

  it("rejects unreadable or non-bundle input with a plain message", async () => {
    const r = await verifyBundleFile({ hello: "world" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("not_a_bundle");
    expect(r.message).toMatch(/does not look like an Aegis evidence bundle/);
  });

  it("rejects a bundle listing a different key than the one Aegis published", async () => {
    const keys = await keyPair();
    const other = await keyPair();
    const { receipts, sealed } = await chain(1, keys);
    const bundle = buildEvidenceBundle({
      organization_id: ORG,
      trace_id: "tr_1",
      receipts,
      sealed_events: sealed,
      keys: { [keys.keyId]: keys.publicKeyB64 },
    });
    const r = await verifyBundleFile(bundle, {
      trustedKeys: { [keys.keyId]: other.publicKeyB64 },
    });
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.code === "key_untrusted")).toBe(true);
  });

  it("contiguous chain export: swapped and deleted receipts fail", async () => {
    const keys = await keyPair();
    const { receipts, sealed } = await chain(5, keys);
    const keyMap = { [keys.keyId]: keys.publicKeyB64 };
    const full = buildEvidenceBundle({
      organization_id: ORG,
      trace_id: "tr_chain",
      receipts,
      sealed_events: sealed,
      keys: keyMap,
      subset: false,
    });
    expect((await verifyBundleFile(full)).ok).toBe(true);

    const swapped = structuredClone(full);
    [swapped.receipts[1], swapped.receipts[2]] = [swapped.receipts[2]!, swapped.receipts[1]!];
    const s = await verifyBundleFile(swapped);
    expect(s.ok).toBe(false);
    expect(s.findings.some((f) => f.code === "chain_failure")).toBe(true);
    expect(s.checks.find((c) => c.id === "chain")?.status).toBe("fail");

    const deleted = structuredClone(full);
    deleted.receipts.splice(2, 1);
    deleted.evidence.splice(2, 1);
    const d = await verifyBundleFile(deleted);
    expect(d.ok).toBe(false);
    expect(d.findings.some((f) => f.code === "missing_sequence")).toBe(true);
    expect(d.findings.find((f) => f.code === "missing_sequence")!.message).toMatch(
      /missing/i,
    );
  });

  it("case extract (subset): adjacent receipts must link; out-of-order fails", async () => {
    const keys = await keyPair();
    const { receipts, sealed } = await chain(3, keys);
    const keyMap = { [keys.keyId]: keys.publicKeyB64 };
    // Receipts 1 and 3 belong to this case; 2 belongs to another case.
    const extract = buildEvidenceBundle({
      organization_id: ORG,
      trace_id: "tr_x",
      receipts: [receipts[0]!, receipts[2]!],
      sealed_events: sealed,
      keys: keyMap,
    });
    expect(extract.subset).toBe(true);
    expect((await verifyBundleFile(extract)).ok).toBe(true);

    const reversed = structuredClone(extract);
    reversed.receipts.reverse();
    expect((await verifyBundleFile(reversed)).ok).toBe(false);

    // Adjacent receipts with a broken prev_hash link still fail in subset mode.
    const adjacent = buildEvidenceBundle({
      organization_id: ORG,
      trace_id: "tr_x",
      receipts: [receipts[0]!, receipts[1]!],
      sealed_events: sealed,
      keys: keyMap,
    });
    const broken = structuredClone(adjacent);
    broken.receipts[1]!.prev_hash = "sha256:deadbeef";
    expect((await verifyBundleFile(broken)).ok).toBe(false);
  });

  it("flags provisional (unstored) cited events without failing the signature check", async () => {
    const keys = await keyPair();
    const body = buildReceiptBody({
      organization_id: ORG,
      seq: 1,
      prev_hash: null,
      case_id: "case-p",
      decision_id: "dec-p",
      outcome: "hold",
      mode: "enforce",
      matched_rules: [],
      sealed_events: [
        { event_id: "evt_gov_abc", event_hash: "sha256:p", sequence_num: 1 },
      ],
      key_id: keys.keyId,
    });
    const signed = await signForensicReceipt(body, keys.privateKeyB64);
    const bundle = buildEvidenceBundle({
      organization_id: ORG,
      trace_id: "tr_p",
      receipts: [signed],
      sealed_events: [],
      keys: { [keys.keyId]: keys.publicKeyB64 },
    });
    expect(bundle.sealed_events[0]?.provisional).toBe(true);
    expect((await verifyBundleFile(bundle)).ok).toBe(true);
  });
});

describe("verify checks", () => {
  it("never folds a pending witness into the pass/fail checks", () => {
    const checks = buildVerifyChecks({ ok: true, findings: [] }, "pending");
    const witness = checks.find((c) => c.id === "witness")!;
    expect(witness.status).toBe("pending");
    expect(checks.filter((c) => c.id !== "witness").every((c) => c.status === "pass")).toBe(
      true,
    );
  });

  it("labels Salanor witness checkpoint unless externally anchored", () => {
    expect(witnessCheckpointLabel("internal")).toBe(
      "Salanor witness checkpoint (signed)",
    );
    expect(witnessCheckpointLabel("bitcoin")).toMatch(/Externally anchored/);
    const checks = buildVerifyChecks(
      { ok: true, findings: [] },
      "included",
      { witness_label: witnessCheckpointLabel("internal") },
    );
    expect(checks.find((c) => c.id === "witness")!.label).toBe(
      "Salanor witness checkpoint (signed)",
    );
  });
});

describe("A5 witness offline inclusion", () => {
  it("verifies merkle path + root signature + local-test timestamp in the bundle", async () => {
    const prevKey = process.env.DEV_SIGNING_PRIVATE_KEY_B64;
    process.env.DEV_SIGNING_PRIVATE_KEY_B64 =
      prevKey ?? "mqUA8ONIg7SN0gL8luCakqehaIzp8Lys6ZHMjAoBx/M=";
    try {
      const keys = await keyPair();
      const { receipts, sealed } = await chain(1, keys);
      const leaf = sealed[0]!.event_hash;
      const otherLeaf = "sha256:siblingleaf";
      const { root, layers } = buildMerkleTree([leaf, otherLeaf]);
      const path = getMerkleProof(layers, 0);
      expect(path.length).toBeGreaterThan(0);
      const sig = await signWitnessCheckpoint(root);
      expect(sig).toBeTruthy();
      const messageHash = `sha256:${root.toLowerCase()}`;
      const token = createLocalTestTimestamp(messageHash);
      const witnessPub = Buffer.from(
        await (await import("@noble/ed25519")).getPublicKeyAsync(
          Buffer.from(process.env.DEV_SIGNING_PRIVATE_KEY_B64!, "base64"),
        ),
      ).toString("base64");

      const bundle = buildEvidenceBundle({
        organization_id: ORG,
        trace_id: "tr_w",
        receipts,
        sealed_events: sealed,
        keys: {
          [keys.keyId]: keys.publicKeyB64,
          [sig!.sig_key_id]: witnessPub,
        },
        witness: [
          {
            event_id: "evt_1",
            status: "included",
            label: witnessCheckpointLabel("internal"),
            root_hash: root,
            merkle_path: path,
            root_sig_value_b64: sig!.sig_value_b64,
            root_sig_key_id: sig!.sig_key_id,
            anchoring_type: "internal",
            timestamp: {
              status: "stamped",
              authority: "local-test-tsa",
              gen_time_utc: token.issued_at,
              tsa_url: null,
              message_hash: messageHash,
              token_b64: token.token_b64,
            },
          },
        ],
      });

      expect(witnessLabelFromBundle(bundle)).toBe(
        "Salanor witness checkpoint (signed)",
      );
      const good = await verifyBundleFile(bundle);
      expect(good.ok).toBe(true);
      expect(good.checks.find((c) => c.id === "witness")?.label).toBe(
        "Salanor witness checkpoint (signed)",
      );

      const tampered = structuredClone(bundle);
      tampered.witness![0]!.merkle_path![0]!.sibling = "ff".repeat(32);
      const bad = await verifyBundleFile(tampered);
      expect(bad.ok).toBe(false);
      expect(bad.findings.some((f) => f.code === "witness_inclusion_invalid")).toBe(
        true,
      );

      // Pre-A5 bundle without merkle_path still verifies.
      const legacy = structuredClone(bundle);
      delete legacy.witness![0]!.merkle_path;
      delete legacy.witness![0]!.root_sig_value_b64;
      delete legacy.witness![0]!.timestamp;
      expect((await verifyBundleFile(legacy)).ok).toBe(true);
    } finally {
      if (prevKey === undefined) delete process.env.DEV_SIGNING_PRIVATE_KEY_B64;
      else process.env.DEV_SIGNING_PRIVATE_KEY_B64 = prevKey;
    }
  });
});

describe("evidence PDF", () => {
  it("renders a valid one-page PDF with plain facts", async () => {
    const keys = await keyPair();
    const { receipts, sealed } = await chain(1, keys);
    const bundle = buildEvidenceBundle({
      organization_id: ORG,
      trace_id: "tr_1",
      receipts,
      sealed_events: sealed,
      keys: { [keys.keyId]: keys.publicKeyB64 },
    });
    const pdf = await renderEvidencePdf(bundle);
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("Aegis evidence record");
    expect(text).toContain("RWF 1,200,000");
    expect(text).toContain("AUTH-RL-1 · Within officer limit");
    expect(text).toContain(
      "No approval needed: allowed automatically by rule AUTH-RL-1 · Within officer limit",
    );
    expect(text).not.toMatch(/pol_v3/);
    expect(text).not.toContain("governed.action");
    expect(text.match(/\/Type \/Page /g)).toHaveLength(1);

    const startxref = Number(/startxref\n(\d+)\n/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
  });

  it("escapes parentheses and keeps the stream valid for odd characters", () => {
    const pdf = renderOnePagePdf([{ text: "Amount (RWF) \\ 日本 café" }]).toString("latin1");
    expect(pdf).toContain("\\(RWF\\)");
    expect(pdf).toContain("café");
    expect(pdf).toContain("??");
  });

  it("wraps long tokens instead of overflowing the page", () => {
    const lines = wrapText("a".repeat(400), 8);
    expect(lines.length).toBeGreaterThan(1);
  });
});
