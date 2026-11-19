/**
 * Stage 7: input commitments bound into bundles; verifier checks supplied docs.
 */
import { describe, expect, it } from "vitest";
import {
  buildEvidenceBundle,
  verifyBundleFile,
} from "../src/forensic/evidence-bundle.js";
import {
  collectCommitmentsFromReceipts,
  maybeStoreEncryptedCopy,
  parseInputCommitments,
  sha256HexOfBytes,
  verifySuppliedDocuments,
} from "../src/sources/input-commitments.js";
import type { SignedForensicReceipt } from "../src/forensic/receipt.js";
import {
  buildFieldAssertions,
  buildProvenanceBlock,
} from "../src/sources/provenance.js";

function fakeReceipt(
  attributes: Record<string, unknown>,
): SignedForensicReceipt {
  const issued_at = "2026-11-18T12:00:00.000Z";
  const provenance = buildProvenanceBlock({
    source_id: "src_los",
    source_name: "LOS",
    authentication: "bearer_key",
    field_assertions: buildFieldAssertions(["amount"]),
    recorded_at: issued_at,
  });
  return {
    schema_version: 1,
    receipt_id: "rcpt_commit_1",
    organization_id: "11111111-1111-4111-8111-111111111111",
    seq: 1,
    prev_hash: null,
    case_id: "LN-COMMIT-1",
    decision_id: "dec_1",
    outcome: "allow",
    mode: "record_only",
    matched_rules: [],
    sealed_events: [
      {
        event_id: "evt_1",
        event_hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        sequence_num: 1,
      },
    ],
    attributes,
    provenance,
    receipt_hash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    key_id: "k_test",
    sig_alg: "ed25519",
    sig_value_b64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    issued_at,
  };
}

describe("input commitments (Stage 7)", () => {
  it("parses commitments from event attributes", () => {
    const doc = new TextEncoder().encode("application form v1");
    const sha = sha256HexOfBytes(doc);
    const parsed = parseInputCommitments({
      input_commitments: [
        { name: "application_form.pdf", sha256: sha, media_type: "application/pdf" },
        { name: "bad", sha256: "not-a-hash" },
      ],
    });
    expect(parsed).toEqual([
      {
        name: "application_form.pdf",
        sha256: sha,
        media_type: "application/pdf",
        size_bytes: null,
      },
    ]);
  });

  it("verifies supplied documents against commitments", () => {
    const bytes = new TextEncoder().encode("kyc-scan");
    const sha = sha256HexOfBytes(bytes);
    const commitments = [{ name: "kyc.pdf", sha256: sha }];
    const ok = verifySuppliedDocuments(commitments, [
      { name: "kyc.pdf", content: bytes },
    ]);
    expect(ok.ok).toBe(true);

    const bad = verifySuppliedDocuments(commitments, [
      { name: "kyc.pdf", content: "tampered", encoding: "utf8" },
    ]);
    expect(bad.ok).toBe(false);
    expect(bad.checks[0]?.message).toMatch(/does not match/);
  });

  it("encrypted copy storage is off by default", () => {
    delete process.env.AEGIS_STORE_INPUT_COPIES;
    const result = maybeStoreEncryptedCopy({
      organization_id: "org",
      case_id: "LN-1",
      commitment: { name: "a.pdf", sha256: "a".repeat(64) },
      bytes: new Uint8Array([1, 2, 3]),
    });
    expect(result.stored).toBe(false);
    if (!result.stored) {
      expect(result.reason).toMatch(/off/);
    }
  });

  it("bundle binds commitment hashes from sealed receipts", async () => {
    const bytes = new TextEncoder().encode("bureau-response-json");
    const sha = sha256HexOfBytes(bytes);
    const receipt = fakeReceipt({
      amount: "1000",
      input_commitments: [{ name: "bureau.json", sha256: sha }],
    });
    const bound = collectCommitmentsFromReceipts([receipt]);
    expect(bound[0]?.sha256).toBe(sha);

    const bundle = buildEvidenceBundle({
      organization_id: receipt.organization_id,
      trace_id: "tr_1",
      case_id: receipt.case_id,
      receipts: [receipt],
      keys: { k_test: Buffer.alloc(32).toString("base64") },
    });
    expect(bundle.input_commitments?.[0]?.name).toBe("bureau.json");
    expect(bundle.input_commitments?.[0]?.sha256).toBe(sha);

    const verified = await verifyBundleFile(bundle, {
      suppliedDocuments: [{ name: "bureau.json", content: bytes }],
    });
    // Signature will fail on the fake receipt, but commitment check should not add a mismatch.
    expect(
      verified.findings.some((f) => f.code === "input_commitment_mismatch"),
    ).toBe(false);

    const mismatch = await verifyBundleFile(bundle, {
      suppliedDocuments: [{ name: "bureau.json", content: "nope", encoding: "utf8" }],
    });
    expect(
      mismatch.findings.some((f) => f.code === "input_commitment_mismatch"),
    ).toBe(true);
  });
});
