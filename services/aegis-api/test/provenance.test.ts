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
  renderEvidencePdf,
  verifyBundleFile,
} from "../src/forensic/evidence-bundle.js";
import {
  GRADE_CHANGE_OUTCOME,
  PROVENANCE_LIMITATIONS,
  buildCaseProvenance,
  buildFieldAssertions,
  buildProvenanceBlock,
  gradeFromChecks,
  summarizeReceiptProvenance,
  type ProvenanceBlock,
} from "../src/sources/provenance.js";

const ORG = "00000000-0000-0000-0000-000000000001";
const CASE = "case-prov-1";
const SEALED_AT = "2026-03-01T10:00:00.000Z";

async function keyPair() {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  return {
    privateKeyB64: Buffer.from(privateKey).toString("base64"),
    publicKeyB64: Buffer.from(publicKey).toString("base64"),
    keyId: "key_prov_1",
  };
}

type Keys = Awaited<ReturnType<typeof keyPair>>;

const SEALED_EVENT = {
  event_id: "evt_1",
  event_hash: "sha256:evt1",
  sequence_num: 1,
};

function bearerBlock(): ProvenanceBlock {
  return buildProvenanceBlock({
    source_id: "ingest_key:ik_1",
    source_name: "Demo Core Banking",
    authentication: "bearer_key",
    field_assertions: buildFieldAssertions(["amount", "currency"]),
    recorded_at: SEALED_AT,
  });
}

async function dataReceipt(
  keys: Keys,
  opts: {
    seq?: number;
    prev?: string | null;
    provenance?: ProvenanceBlock;
    attributes?: Record<string, unknown>;
  } = {},
): Promise<SignedForensicReceipt> {
  const body = buildReceiptBody({
    organization_id: ORG,
    seq: opts.seq ?? 1,
    prev_hash: opts.prev ?? null,
    case_id: CASE,
    decision_id: `dec-${opts.seq ?? 1}`,
    outcome: "allow",
    mode: "enforce",
    matched_rules: [],
    sealed_events: [SEALED_EVENT],
    attributes: opts.attributes ?? { amount: 1_200_000, currency: "RWF" },
    key_id: keys.keyId,
    issued_at: SEALED_AT,
    ...(opts.provenance ? { provenance: opts.provenance } : {}),
  });
  return signForensicReceipt(body, keys.privateKeyB64);
}

async function gradeChangeReceipt(
  keys: Keys,
  opts: {
    seq: number;
    prev: string;
    from: string;
    to: string;
    reason?: string;
    checks?: Record<string, boolean>;
  },
): Promise<SignedForensicReceipt> {
  const body = buildReceiptBody({
    organization_id: ORG,
    seq: opts.seq,
    prev_hash: opts.prev,
    case_id: CASE,
    decision_id: `dec-gc-${opts.seq}`,
    outcome: GRADE_CHANGE_OUTCOME as never,
    mode: "enforce",
    matched_rules: [],
    sealed_events: [SEALED_EVENT],
    attributes: {
      grade_change: {
        from_grade: opts.from,
        to_grade: opts.to,
        reason: opts.reason ?? "Matched the settlement file from the processor",
        feed_name: "Processor settlement file",
        checks: opts.checks ?? { reconciled: true },
      },
    },
    key_id: keys.keyId,
    issued_at: "2026-03-02T09:00:00.000Z",
  });
  return signForensicReceipt(body, keys.privateKeyB64);
}

function bundleFor(keys: Keys, receipts: SignedForensicReceipt[]) {
  return {
    receipts,
    sealed_events: [SEALED_EVENT],
    keys: { [keys.keyId]: keys.publicKeyB64 },
  };
}

describe("provenance block is part of the signed receipt", () => {
  it("is included in the signed payload and the bundle verifies", async () => {
    const keys = await keyPair();
    const receipt = await dataReceipt(keys, { provenance: bearerBlock() });

    expect(receipt.provenance).toBeDefined();
    expect(receipt.provenance?.limitations).toBe(PROVENANCE_LIMITATIONS);
    expect(receipt.provenance?.grade_at_seal).toBe("G0");
    expect(Object.keys(receipt.provenance!.checks).sort()).toEqual([
      "approver_bound",
      "execution_matched",
      "independently_captured",
      "reconciled",
      "source_signed",
    ]);

    const verdict = await verifyForensicBundle(bundleFor(keys, [receipt]));
    expect(verdict.ok).toBe(true);
    expect(verdict.findings).toEqual([]);

    // It travels in the canonical JSON that the signature covers.
    const bundle = buildEvidenceBundle({
      organization_id: ORG,
      trace_id: "tr_1",
      receipts: [receipt],
      sealed_events: [{ ...SEALED_EVENT, emitted_at: new Date(SEALED_AT) }],
      keys: { [keys.keyId]: keys.publicKeyB64 },
    });
    expect(bundle.evidence[0]!.canonical_payload).toContain('"provenance":{');
  });

  it("editing any part of the block breaks verification", async () => {
    const keys = await keyPair();
    const receipt = await dataReceipt(keys, { provenance: bearerBlock() });

    const edits: Array<[string, (r: SignedForensicReceipt) => void]> = [
      ["grade", (r) => (r.provenance!.grade_at_seal = "G3")],
      ["source name", (r) => (r.provenance!.source_name = "Some Other Bank")],
      ["authentication", (r) => (r.provenance!.authentication = "mtls")],
      ["check flag", (r) => (r.provenance!.checks.reconciled = true)],
      ["limitations text", (r) => (r.provenance!.limitations = "Everything is accurate.")],
      ["recorded_at", (r) => (r.provenance!.recorded_at = "2026-01-01T00:00:00.000Z")],
      ["field assertion", (r) => (r.provenance!.field_assertions.amount = "independently_captured")],
    ];
    for (const [label, edit] of edits) {
      const tampered = structuredClone(receipt);
      edit(tampered);
      const verdict = await verifyForensicBundle(bundleFor(keys, [tampered]));
      expect(verdict.ok, `edit: ${label}`).toBe(false);
      expect(
        verdict.findings.some((f) => f.code === "receipt_hash_mismatch"),
        `edit: ${label}`,
      ).toBe(true);
    }

    // Removing the block altogether is also caught (it is covered by the hash).
    const stripped = structuredClone(receipt) as Partial<SignedForensicReceipt>;
    delete stripped.provenance;
    const verdict = await verifyForensicBundle(
      bundleFor(keys, [stripped as SignedForensicReceipt]),
    );
    expect(verdict.ok).toBe(false);
  });

  it("flags a re-signed block whose grade does not follow from its checks", async () => {
    const keys = await keyPair();
    const lying = { ...bearerBlock(), evidence_grade: "G1" as const, grade_at_seal: "G1" as const };
    const receipt = await dataReceipt(keys, { provenance: lying });
    const verdict = await verifyForensicBundle(bundleFor(keys, [receipt]));
    expect(verdict.ok).toBe(false);
    expect(verdict.findings.some((f) => f.code === "provenance_invalid")).toBe(true);
  });

  it("flags a claimed source signature that has no signed envelope behind it", async () => {
    const keys = await keyPair();
    const claimed = buildProvenanceBlock({
      source_id: "src_core",
      source_name: "Demo Core Banking",
      source_key_id: "k_core_2026_01",
      authentication: "source_signature",
      recorded_at: SEALED_AT,
    });
    expect(claimed.grade_at_seal).toBe("G1");
    const receipt = await dataReceipt(keys, { provenance: claimed });
    const verdict = await verifyForensicBundle(bundleFor(keys, [receipt]));
    expect(verdict.ok).toBe(false);
    const finding = verdict.findings.find((f) => f.code === "provenance_invalid");
    expect(finding?.message).toMatch(/no signed envelope/);
  });
});

describe("legacy receipts (no provenance block)", () => {
  it("verify, and read as G0 legacy", async () => {
    const keys = await keyPair();
    const legacy = await dataReceipt(keys); // sealed before Stage 2: no provenance field
    expect("provenance" in legacy).toBe(false);

    const verdict = await verifyForensicBundle(bundleFor(keys, [legacy]));
    expect(verdict.ok).toBe(true);
    expect(verdict.findings).toEqual([]);

    const summary = summarizeReceiptProvenance(legacy);
    expect(summary).toMatchObject({ has_block: false, legacy: true, grade_at_seal: "G0" });

    const view = buildCaseProvenance([legacy])!;
    expect(view.legacy).toBe(true);
    expect(view.grade_at_seal).toBe("G0");
    expect(view.current_grade).toBe("G0");
    expect(view.source_line).toContain("G0 (legacy)");
    expect(view.source_line).toContain("does not check that the data is accurate");
    expect(view.checklist.every((c) => !c.met)).toBe(true);
  });

  it("a legacy evidence bundle file verifies and states G0 legacy", async () => {
    const keys = await keyPair();
    const legacy = await dataReceipt(keys);
    const bundle = buildEvidenceBundle({
      organization_id: ORG,
      trace_id: "tr_1",
      receipts: [legacy],
      sealed_events: [{ ...SEALED_EVENT, emitted_at: new Date(SEALED_AT) }],
      keys: { [keys.keyId]: keys.publicKeyB64 },
    });
    // Simulate a file written before Stage 2: no provenance anywhere outside the receipt.
    const old = JSON.parse(JSON.stringify(bundle)) as Record<string, unknown>;
    delete old.provenance;
    for (const ev of old.evidence as Array<Record<string, unknown>>) delete ev.provenance;

    const result = await verifyBundleFile(old);
    expect(result.ok).toBe(true);
    expect(result.source_line).toContain("G0 (legacy)");
    expect(result.record_line).toMatch(/^Record intact: signed and unchanged since /);
  });

  it("a Stage 1 signed-envelope receipt without a block reads as G1 legacy", () => {
    const stage1 = {
      receipt_id: "r1",
      seq: 1,
      outcome: "allow",
      issued_at: SEALED_AT,
      attributes: {
        source_envelope: {
          source_id: "src_los",
          key_id: "k_los_2026_01",
          signature: "sig",
        },
      },
    };
    const view = buildCaseProvenance([stage1])!;
    expect(view.legacy).toBe(true);
    expect(view.grade_at_seal).toBe("G1");
    expect(view.source?.authentication).toBe("source_signature");
    expect(view.source_line).toMatch(/^Source of the data: G1/);
  });
});

describe("grade changes", () => {
  it("raise the current grade while the grade at seal stays as sealed", async () => {
    const keys = await keyPair();
    const first = await dataReceipt(keys, { provenance: bearerBlock() });
    const change = await gradeChangeReceipt(keys, {
      seq: 2,
      prev: first.receipt_hash,
      from: "G0",
      to: "G2",
    });

    const verdict = await verifyForensicBundle(bundleFor(keys, [first, change]));
    expect(verdict.ok).toBe(true);

    const view = buildCaseProvenance([first, change])!;
    expect(view.grade_at_seal).toBe("G0");
    expect(view.current_grade).toBe("G2");
    expect(view.grade_changes).toHaveLength(1);
    expect(view.grade_changes[0]).toMatchObject({
      from_grade: "G0",
      to_grade: "G2",
      feed_name: "Processor settlement file",
    });
    expect(view.checks.reconciled).toBe(true);
    expect(view.source_line).toMatch(/^Source of the data: G2\./);
    expect(view.headline).toContain("grade G0 at seal, now G2");
    // The receipt itself still says what the grade was when it was sealed.
    expect(first.provenance?.grade_at_seal).toBe("G0");
  });

  it("shows the current grade for a case that only has its seal-time grade", async () => {
    const keys = await keyPair();
    const first = await dataReceipt(keys, { provenance: bearerBlock() });
    const view = buildCaseProvenance([first])!;
    expect(view.current_grade).toBe("G0");
    expect(view.grade_at_seal).toBe("G0");
    expect(view.grade_changes).toEqual([]);
  });

  it("rejects a change that does not raise the grade, or starts from the wrong grade", async () => {
    const keys = await keyPair();
    const first = await dataReceipt(keys, { provenance: bearerBlock() });

    const flat = await gradeChangeReceipt(keys, {
      seq: 2,
      prev: first.receipt_hash,
      from: "G0",
      to: "G0",
    });
    const flatVerdict = await verifyForensicBundle(bundleFor(keys, [first, flat]));
    expect(flatVerdict.ok).toBe(false);
    expect(flatVerdict.findings.some((f) => f.code === "grade_change_invalid")).toBe(true);

    const wrongStart = await gradeChangeReceipt(keys, {
      seq: 2,
      prev: first.receipt_hash,
      from: "G1",
      to: "G2",
    });
    const wrongVerdict = await verifyForensicBundle(bundleFor(keys, [first, wrongStart]));
    expect(wrongVerdict.ok).toBe(false);
    const finding = wrongVerdict.findings.find((f) => f.code === "grade_change_invalid");
    expect(finding?.message).toMatch(/starts from G1 but the case was at G0/);

    const noReason = await gradeChangeReceipt(keys, {
      seq: 2,
      prev: first.receipt_hash,
      from: "G0",
      to: "G2",
      reason: "  ",
    });
    const noReasonVerdict = await verifyForensicBundle(bundleFor(keys, [first, noReason]));
    expect(noReasonVerdict.findings.some((f) => f.code === "grade_change_invalid")).toBe(true);
  });

  it("gradeFromChecks follows the checks, never the reverse", () => {
    const none = { source_signed: false, approver_bound: false, execution_matched: false, reconciled: false, independently_captured: false };
    expect(gradeFromChecks(none)).toBe("G0");
    expect(gradeFromChecks({ ...none, approver_bound: true })).toBe("G0");
    expect(gradeFromChecks({ ...none, source_signed: true })).toBe("G1");
    expect(gradeFromChecks({ ...none, source_signed: true, reconciled: true })).toBe("G2");
    expect(gradeFromChecks({ ...none, execution_matched: true })).toBe("G2");
    expect(gradeFromChecks({ ...none, independently_captured: true })).toBe("G3");
  });
});

describe("provenance in the evidence bundle and PDF", () => {
  it("is in the bundle, the PDF, and a tampered summary is caught", async () => {
    const keys = await keyPair();
    const first = await dataReceipt(keys, { provenance: bearerBlock() });
    const change = await gradeChangeReceipt(keys, {
      seq: 2,
      prev: first.receipt_hash,
      from: "G0",
      to: "G2",
    });
    const bundle = buildEvidenceBundle({
      organization_id: ORG,
      trace_id: "tr_1",
      receipts: [first, change],
      sealed_events: [{ ...SEALED_EVENT, emitted_at: new Date(SEALED_AT) }],
      keys: { [keys.keyId]: keys.publicKeyB64 },
    });

    expect(bundle.provenance?.grade_at_seal).toBe("G0");
    expect(bundle.provenance?.current_grade).toBe("G2");
    expect(bundle.evidence[0]!.provenance?.grade_at_seal).toBe("G0");

    const good = await verifyBundleFile(JSON.parse(JSON.stringify(bundle)));
    expect(good.ok).toBe(true);
    expect(good.record_line).toMatch(/^Record intact: signed and unchanged since /);
    expect(good.source_line).toMatch(/^Source of the data: G2/);
    expect(good.provenance?.current_grade).toBe("G2");

    const pdf = (await renderEvidencePdf(bundle)).toString("latin1");
    expect(pdf).toContain("Where this data came from");
    expect(pdf).toContain("Record intact: signed and unchanged since");
    expect(pdf).toContain("Source of the data: G2");
    expect(pdf).toContain("does not check that the data is accurate");

    // Raise the grade in the unsigned summary only: the signed receipts disagree.
    const edited = JSON.parse(JSON.stringify(bundle)) as { provenance: { current_grade: string } };
    edited.provenance.current_grade = "G3";
    const bad = await verifyBundleFile(edited);
    expect(bad.ok).toBe(false);
    expect(bad.findings.some((f) => f.code === "summary_mismatch")).toBe(true);
  });
});
