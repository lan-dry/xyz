/**
 * Stage 5 — approver binding: view hash, identity seal, SoD, stale refuse.
 */
import { describe, expect, it } from "vitest";
import * as ed from "@noble/ed25519";
import {
  assertApprovedViewFresh,
  buildApproverBinding,
  hashApprovedView,
  hashApprovedViewFromEventPayload,
  separationOfDutiesEnabled,
  type ApproverBinding,
  type WebAuthnApproverAssertion,
} from "../src/approvals/approver-binding.js";
import { buildRequestPreview } from "../src/approvals/request-preview.js";
import { evaluateConsoleApprovalAttempt } from "../src/bank/console-approval-guard.js";
import { loadDemoPack, packRoles } from "../src/packs/load.js";
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
    keyId: "key_s5_test",
  };
}

const GATE_PAYLOAD = {
  amount: 15_000_000,
  currency: "RWF",
  beneficiary: "ACC-991",
  summary: "Retail loan disbursement",
  requester_email: "claire.uwase@demo.bank.rw",
};

const BINDING: ApproverBinding = buildApproverBinding({
  accountId: "acct_jean",
  membershipId: "mem_jean",
  sessionId: "sess_jean_1",
  roleKey: "credit_manager",
  ssoSubject: "sso:jean",
  stepUpMfa: false,
});

async function holdAndOutcome(
  keys: Awaited<ReturnType<typeof keyPair>>,
  opts?: {
    binding?: ApproverBinding;
    viewHash?: string;
    gatePayload?: Record<string, unknown>;
  },
) {
  const gatePayload = opts?.gatePayload ?? GATE_PAYLOAD;
  const viewHash =
    opts?.viewHash ?? hashApprovedViewFromEventPayload(gatePayload);
  const binding = opts?.binding ?? BINDING;

  const holdBody = buildReceiptBody({
    organization_id: "00000000-0000-0000-0000-0000000000a5",
    seq: 1,
    prev_hash: null,
    case_id: "case-s5",
    decision_id: "dec-s5",
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
    decision_id: "dec-s5:approved",
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
      approval_id: "apr_s5",
      approval_decision: "approved",
      approver_user_id: binding.membership_id,
      approver_display_name: "Jean Mutabazi",
      approver_role: "credit_manager",
      approved_view_hash: viewHash,
      approver_binding: binding,
      approval_reason: "Cash-flow forecast reviewed.",
    },
    approvals: [
      {
        approval_id: "apr_s5",
        decision: "approved",
        approver_user_id: binding.membership_id,
        approver_display_name: "Jean Mutabazi",
        approver_role: "credit_manager",
        approver_role_label: "Credit Manager",
        approver_email: "jean.mutabazi@demo.bank.rw",
        approved_view_hash: viewHash,
        approver_binding: binding,
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
  return { hold, outcome, keys, viewHash, binding, gatePayload };
}

function bundleOf(
  receipts: SignedForensicReceipt[],
  keys: Awaited<ReturnType<typeof keyPair>>,
  opts: {
    gatePayload: Record<string, unknown>;
    binding: ApproverBinding;
    viewHash: string;
    softApproverEmail?: string;
    softAccountId?: string;
    softViewHash?: string;
  },
) {
  const evidence = receipts.map((r) => ({
    receipt_id: r.receipt_id,
    seq: r.seq,
    prev_hash: r.prev_hash,
    receipt_hash: r.receipt_hash,
    event_hash: r.sealed_events[0]?.event_hash ?? null,
    event_id: r.sealed_events[0]?.event_id ?? null,
    event_seq: r.sealed_events[0]?.sequence_num ?? null,
    canonical_payload: "",
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
    case_id: "case-s5",
    trace_id: "trc_s5",
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
        payload: opts.gatePayload,
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
        approval_id: "apr_s5",
        status: "approved",
        created_at: "2026-11-17T20:00:00.000Z",
        decided_at: "2026-11-17T21:01:00.000Z",
        approved_view_hash: opts.softViewHash ?? opts.viewHash,
        votes: [
          {
            voter_user_id: opts.binding.membership_id,
            voter_account_id: opts.softAccountId ?? opts.binding.account_id,
            session_id: opts.binding.session_id,
            voter_email:
              opts.softApproverEmail ?? "jean.mutabazi@demo.bank.rw",
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

describe("Stage 5 approver binding", () => {
  it("hashes the same canonical preview the console request_preview uses", () => {
    const preview = buildRequestPreview(GATE_PAYLOAD);
    const a = hashApprovedView(preview);
    const b = hashApprovedViewFromEventPayload(GATE_PAYLOAD);
    expect(a).toBe(b);
    expect(a.startsWith("sha256:")).toBe(true);
    expect(a.length).toBeGreaterThan(20);
  });

  it("exposes WebAuthnApproverAssertion interface without wiring login", () => {
    const assertion: WebAuthnApproverAssertion = {
      credential_id: "cred_1",
      client_data_json_b64: "Y2xpZW50",
      authenticator_data_b64: "YXV0aA==",
      signature_b64: "c2ln",
    };
    const binding = buildApproverBinding({
      accountId: "a",
      membershipId: "m",
      sessionId: "s",
      roleKey: "credit_manager",
      webauthnAssertion: assertion,
    });
    // Partial: client-supplied assertion is never sealed unverified.
    expect(binding.webauthn_assertion).toBeNull();
  });

  it("verifies a hold + outcome with view hash and approver binding", async () => {
    const keys = await keyPair();
    const { hold, outcome, viewHash, binding, gatePayload } =
      await holdAndOutcome(keys);
    const good = await verifyBundleFile(
      bundleOf([hold, outcome], keys, { gatePayload, binding, viewHash }),
    );
    expect(good.ok).toBe(true);
  });

  it("change approver after the fact fails verify", async () => {
    const keys = await keyPair();
    const { hold, outcome, viewHash, binding, gatePayload } =
      await holdAndOutcome(keys);
    const bad = await verifyBundleFile(
      bundleOf([hold, outcome], keys, {
        gatePayload,
        binding,
        viewHash,
        softApproverEmail: "attacker@evil.test",
        softAccountId: "acct_attacker",
      }),
    );
    expect(bad.ok).toBe(false);
    expect(
      bad.findings.some((f) => f.code === "approval_binding_mismatch"),
    ).toBe(true);
  });

  it("payload / view hash mismatch fails verify", async () => {
    const keys = await keyPair();
    const { hold, outcome, viewHash, binding, gatePayload } =
      await holdAndOutcome(keys);
    const tamperedPayload = {
      ...gatePayload,
      amount: 99_000_000,
      beneficiary: "ACC-HACKED",
    };
    const bad = await verifyBundleFile(
      bundleOf([hold, outcome], keys, {
        gatePayload: tamperedPayload,
        binding,
        viewHash,
      }),
    );
    expect(bad.ok).toBe(false);
    expect(
      bad.findings.some((f) => f.code === "approval_view_hash_mismatch"),
    ).toBe(true);

    const softMismatch = await verifyBundleFile(
      bundleOf([hold, outcome], keys, {
        gatePayload,
        binding,
        viewHash,
        softViewHash: "sha256:deadbeef",
      }),
    );
    expect(softMismatch.ok).toBe(false);
    expect(
      softMismatch.findings.some(
        (f) => f.code === "approval_view_hash_mismatch",
      ),
    ).toBe(true);
  });

  it("approving a stale payload (event updated since) is refused", () => {
    const original = hashApprovedViewFromEventPayload(GATE_PAYLOAD);
    const updated = hashApprovedViewFromEventPayload({
      ...GATE_PAYLOAD,
      amount: 18_000_000,
    });
    expect(original).not.toBe(updated);
    const stale = assertApprovedViewFresh(updated, original);
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.code).toBe("stale_approval_payload");

    const fresh = assertApprovedViewFresh(updated, updated);
    expect(fresh.ok).toBe(true);
    if (fresh.ok) {
      expect(fresh.viewConfirmation).toBe("confirmed_by_approver");
    }
  });

  it("omitted view hash seals server-rendered, not confirmed by approver", () => {
    const current = hashApprovedViewFromEventPayload(GATE_PAYLOAD);
    const omitted = assertApprovedViewFresh(current, undefined);
    expect(omitted.ok).toBe(true);
    if (omitted.ok) {
      expect(omitted.viewConfirmation).toBe(
        "server-rendered, not confirmed by approver",
      );
    }
    const blank = assertApprovedViewFresh(current, "   ");
    expect(blank.ok).toBe(true);
    if (blank.ok) {
      expect(blank.viewConfirmation).toBe(
        "server-rendered, not confirmed by approver",
      );
    }
  });

  it("step_up_mfa is stored only as claimed_by_client, never verified", () => {
    const claimed = buildApproverBinding({
      accountId: "a",
      membershipId: "m",
      sessionId: "s",
      roleKey: "credit_manager",
      stepUpMfa: true,
    });
    expect(claimed.step_up_mfa).toEqual({ claimed_by_client: true });
    const none = buildApproverBinding({
      accountId: "a",
      membershipId: "m",
      sessionId: "s",
      roleKey: "credit_manager",
      stepUpMfa: false,
    });
    expect(none.step_up_mfa).toBe(false);
  });

  it("binds each approver separately for two-person approvals", () => {
    const first = buildApproverBinding({
      accountId: "acct_jean",
      membershipId: "mem_jean",
      sessionId: "sess_jean",
      roleKey: "credit_manager",
      ssoSubject: "sso:jean",
      stepUpMfa: false,
    });
    const second = buildApproverBinding({
      accountId: "acct_aline",
      membershipId: "mem_aline",
      sessionId: "sess_aline",
      roleKey: "head_of_credit",
      ssoSubject: "sso:aline",
      stepUpMfa: true,
    });
    expect(first.account_id).not.toBe(second.account_id);
    expect(first.session_id).not.toBe(second.session_id);
    expect(second.step_up_mfa).toEqual({ claimed_by_client: true });
    const votes = [
      { voter_user_id: first.membership_id, binding: first },
      { voter_user_id: second.membership_id, binding: second },
    ];
    expect(votes.map((v) => v.binding.account_id)).toEqual([
      "acct_jean",
      "acct_aline",
    ]);
  });

  it("requester equals approver refused when separation of duties is on", () => {
    const ladder = packRoles(loadDemoPack("banking"));
    const base = {
      actor_membership_id: "mem-claire",
      actor_email: "claire.uwase@demo.bank.rw",
      actor_roles: ["credit_manager"] as string[],
      is_requester: true,
      action: "approve" as const,
      ladder,
      bankRolesAvailable: true,
    };

    expect(separationOfDutiesEnabled({})).toBe(true);
    expect(separationOfDutiesEnabled({ separation_of_duties: true })).toBe(
      true,
    );
    expect(separationOfDutiesEnabled({ separation_of_duties: false })).toBe(
      false,
    );

    const blocked = evaluateConsoleApprovalAttempt({
      ...base,
      metadata: { required_role: "credit_manager" },
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe("separation_of_duties");

    const allowedWhenOff = evaluateConsoleApprovalAttempt({
      ...base,
      metadata: {
        required_role: "credit_manager",
        separation_of_duties: false,
      },
    });
    expect(allowedWhenOff.ok).toBe(true);
  });
});
