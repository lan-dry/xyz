import { describe, expect, it } from "vitest";
import * as ed from "@noble/ed25519";
import {
  buildReceiptBody,
  canonicalReceiptPayload,
  signForensicReceipt,
  type SignedForensicReceipt,
} from "../src/forensic/receipt.js";
import { verifyBundleFile } from "../src/forensic/evidence-bundle.js";

async function keyPair() {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  return {
    privateKeyB64: Buffer.from(privateKey).toString("base64"),
    publicKeyB64: Buffer.from(publicKey).toString("base64"),
    keyId: "key_a1_test",
  };
}

async function holdAndOutcome(keys: Awaited<ReturnType<typeof keyPair>>) {
  const holdBody = buildReceiptBody({
    organization_id: "00000000-0000-0000-0000-0000000000a1",
    seq: 1,
    prev_hash: null,
    case_id: "case-a1",
    decision_id: "dec-a1",
    outcome: "hold",
    mode: "enforce",
    matched_rules: [
      { rule_id: "AUTH-RL-2", policy_id: "pol_v3", decision: "hold" },
    ],
    sealed_events: [
      { event_id: "evt_gate", event_hash: "sha256:gate", sequence_num: 1 },
    ],
    attributes: { amount: 15_000_000, currency: "RWF" },
    plain_summary: "Loan disbursement held for Credit Manager approval.",
    key_id: keys.keyId,
  });
  const hold = await signForensicReceipt(holdBody, keys.privateKeyB64);

  const outcomeBody = buildReceiptBody({
    organization_id: hold.organization_id,
    seq: 2,
    prev_hash: hold.receipt_hash,
    case_id: hold.case_id,
    decision_id: "dec-a1:approved",
    outcome: "approved",
    mode: "enforce",
    matched_rules: hold.matched_rules,
    sealed_events: [
      ...hold.sealed_events,
      { event_id: "evt_human", event_hash: "sha256:human", sequence_num: 2 },
    ],
    attributes: {
      amount: 15_000_000,
      currency: "RWF",
      follows_receipt_hash: hold.receipt_hash,
      follows_receipt_id: hold.receipt_id,
      approval_id: "apr_a1",
      approval_decision: "approved",
      approver_user_id: "mem_jean",
      approver_display_name: "Jean Mutabazi",
      approver_role: "credit_manager",
      approval_reason: "Cash-flow forecast reviewed.",
    },
    approvals: [
      {
        approval_id: "apr_a1",
        decision: "approved",
        approver_user_id: "mem_jean",
        approver_display_name: "Jean Mutabazi",
        approver_role: "credit_manager",
        approver_role_label: "Credit Manager",
        approver_email: "jean.mutabazi@demo.bank.rw",
        reason: "Cash-flow forecast reviewed.",
        decided_at: "2026-11-17T21:01:00.000Z",
        requester_email: "claire.uwase@demo.bank.rw",
        follows_receipt_id: hold.receipt_id,
        follows_receipt_hash: hold.receipt_hash,
      },
    ],
    plain_summary:
      "Approved by Jean Mutabazi · Credit Manager with the reason: Cash-flow forecast reviewed.",
    key_id: keys.keyId,
  });
  const outcome = await signForensicReceipt(outcomeBody, keys.privateKeyB64);
  return { hold, outcome, keys };
}

function bundleOf(receipts: SignedForensicReceipt[], keys: Awaited<ReturnType<typeof keyPair>>) {
  const evidence = receipts.map((r) => ({
    receipt_id: r.receipt_id,
    seq: r.seq,
    prev_hash: r.prev_hash,
    receipt_hash: r.receipt_hash,
    event_hash: r.sealed_events[0]?.event_hash ?? null,
    event_id: r.sealed_events[0]?.event_id ?? null,
    event_seq: r.sealed_events[0]?.sequence_num ?? null,
    canonical_payload: JSON.stringify(
      Object.fromEntries(
        Object.entries(r).filter(
          ([k]) => !["sig_alg", "sig_value_b64", "receipt_hash"].includes(k),
        ),
      ),
    ),
    sig_alg: r.sig_alg,
    sig_value_b64: r.sig_value_b64,
    key_id: r.key_id,
    public_key_b64: keys.publicKeyB64,
    public_key_fingerprint: null,
    issued_at_utc: r.issued_at,
    event_emitted_at_utc: null,
    outcome: r.outcome,
    policy: r.policy ?? null,
    matched_rules: r.matched_rules,
    decision_basis: r.decision_basis ?? null,
    plain_summary: r.plain_summary ?? "",
    who_approved:
      r.outcome === "approved"
        ? "Approved by Jean Mutabazi · Credit Manager."
        : r.outcome === "hold"
          ? "Held. No approval has been recorded yet."
          : "No approval recorded.",
  }));
  for (let i = 0; i < evidence.length; i++) {
    evidence[i]!.canonical_payload = canonicalReceiptPayload(
      receipts[i]! as unknown as Record<string, unknown>,
    );
  }
  return {
    bundle_type: "aegis.evidence_bundle",
    schema_version: 1,
    generated_at_utc: new Date().toISOString(),
    organization_id: receipts[0]!.organization_id,
    case_id: "case-a1",
    trace_id: "trc_a1",
    receipts,
    sealed_events: [
      {
        event_id: "evt_gate",
        event_hash: "sha256:gate",
        sequence_num: 1,
        prev_event_hash: null,
        key_id: keys.keyId,
        sig_alg: "ed25519",
        sig_value_b64: "dGVzdA==",
        emitted_at_utc: null,
      },
      {
        event_id: "evt_human",
        event_hash: "sha256:human",
        sequence_num: 2,
        prev_event_hash: "sha256:gate",
        key_id: keys.keyId,
        sig_alg: "ed25519",
        sig_value_b64: "dGVzdA==",
        emitted_at_utc: null,
      },
    ],
    keys: { [keys.keyId]: keys.publicKeyB64 },
    key_fingerprints: {},
    evidence,
    approvals: [
      {
        approval_id: "apr_a1",
        status: "approved",
        created_at: "2026-11-17T20:00:00.000Z",
        decided_at: "2026-11-17T21:01:00.000Z",
        votes: [
          {
            voter_user_id: "mem_jean",
            voter_email: "jean.mutabazi@demo.bank.rw",
            decision: "approved",
            reason: "Cash-flow forecast reviewed.",
            at: "2026-11-17T21:01:00.000Z",
          },
        ],
      },
    ],
    checkpoint: null,
  };
}

describe("A1 approval outcome receipt binding", () => {
  it("verifies a hold + signed outcome receipt bundle", async () => {
    const keys = await keyPair();
    const { hold, outcome } = await holdAndOutcome(keys);
    const good = await verifyBundleFile(bundleOf([hold, outcome], keys));
    expect(good.ok).toBe(true);
  });

  it("fails when approver email is tampered in the unsigned section", async () => {
    const keys = await keyPair();
    const { hold, outcome } = await holdAndOutcome(keys);
    const bundle = bundleOf([hold, outcome], keys);
    bundle.approvals[0]!.votes[0]!.voter_email = "attacker@evil.test";
    const bad = await verifyBundleFile(bundle);
    expect(bad.ok).toBe(false);
    expect(
      bad.findings.some((f) => f.code === "approval_binding_mismatch"),
    ).toBe(true);
  });

  it("fails when reason is tampered in the unsigned section", async () => {
    const keys = await keyPair();
    const { hold, outcome } = await holdAndOutcome(keys);
    const bundle = bundleOf([hold, outcome], keys);
    bundle.approvals[0]!.votes[0]!.reason = "tampered reason";
    const bad = await verifyBundleFile(bundle);
    expect(bad.ok).toBe(false);
    expect(
      bad.findings.some((f) => f.code === "approval_binding_mismatch"),
    ).toBe(true);
  });

  it("fails when plain summary is tampered", async () => {
    const keys = await keyPair();
    const { hold, outcome } = await holdAndOutcome(keys);
    const bundle = bundleOf([hold, outcome], keys);
    bundle.evidence[1]!.plain_summary = "Allowed automatically by policy.";
    const bad = await verifyBundleFile(bundle);
    expect(bad.ok).toBe(false);
    expect(
      bad.findings.some((f) => f.code === "approval_binding_mismatch"),
    ).toBe(true);
  });

  it("fails when amount attributes are swapped vs signed canonical payload", async () => {
    const keys = await keyPair();
    const { hold, outcome } = await holdAndOutcome(keys);
    const bundle = bundleOf([hold, outcome], keys);
    // Break evidence ↔ signed body binding (amount-related summary mismatch).
    bundle.evidence[0]!.canonical_payload = bundle.evidence[0]!.canonical_payload.replace(
      "15000000",
      "1",
    );
    const bad = await verifyBundleFile(bundle);
    expect(bad.ok).toBe(false);
  });
});
