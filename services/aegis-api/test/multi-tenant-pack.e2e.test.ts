/**
 * Second tenant with a different pack (insurance) runs end-to-end through
 * evaluate → approval guards → receipt → verify with no code changes —
 * only pack/configuration.
 */
import { describe, expect, it } from "vitest";
import * as ed from "@noble/ed25519";
import { evaluateBankEvent } from "../src/bank/evaluate.js";
import { checkApprovalAttempt } from "../src/bank/approvals-guard.js";
import { applyFieldPolicy, findLeakedClearValues } from "../src/bank/field-policy.js";
import {
  buildReceiptBody,
  signForensicReceipt,
} from "../src/forensic/receipt.js";
import { verifyForensicBundle } from "../src/forensic/verify-bundle.js";
import { loadDemoPack, packMatrixRows, packRoles } from "../src/packs/load.js";
import { policyContentHash } from "../src/bank/policy-hash.js";

describe("multi-tenant policy packs (banking + insurance)", () => {
  it("loads two demo packs with distinct roles and products", () => {
    const banking = loadDemoPack("banking");
    const insurance = loadDemoPack("insurance");
    expect(banking.demo_only).toBe(true);
    expect(insurance.demo_only).toBe(true);
    expect(banking.id).not.toBe(insurance.id);
    expect(banking.roles.map((r) => r.role_key)).not.toEqual(
      insurance.roles.map((r) => r.role_key),
    );
    expect(insurance.workflows[0]?.product).toBe("claim_payout");
  });

  it("insurance tenant: staff claim held for fraud_analyst, receipt verifies", async () => {
    const pack = loadDemoPack("insurance");
    const matrix = packMatrixRows(pack);
    const ladder = packRoles(pack);
    const currency = pack.currencies[0]!;
    // Prove currency is pack config, not an engine default (banking pack uses RWF).
    expect(currency).toBe("EUR");
    expect(currency).not.toBe("RWF");
    expect(pack.name.toLowerCase()).toContain("illustrative");
    const tenantId = "00000000-0000-0000-0000-0000000000aa";

    const fielded = applyFieldPolicy(
      {
        amount: 8_000,
        currency,
        product: "claim_payout",
        claimant: { is_staff: true, ssn: "123-45-6789" },
        medical_notes: "sensitive",
      },
      pack.field_policies,
    );
    expect(fielded.stored).not.toHaveProperty("medical_notes");
    const claimant = fielded.stored.claimant as { ssn?: string } | undefined;
    expect(String(claimant?.ssn ?? "")).toMatch(/^sha256:/);
    expect(
      findLeakedClearValues(JSON.stringify(fielded.stored), ["123-45-6789", "sensitive"]),
    ).toEqual([]);

    const evalResult = evaluateBankEvent({
      policy_id: "pol_ins_v1",
      combine: pack.combine,
      rules: pack.rules.map((r) => ({
        rule_id: r.rule_id,
        tool_pattern: r.tool_pattern,
        decision: r.decision,
        priority: r.priority,
        conditions: r.conditions,
        obligations: r.obligations,
        policy_id: "pol_ins_v1",
      })),
      tool_name: "governed.action",
      attributes: fielded.for_evaluate,
      matrix_rows: matrix,
      ladder,
      product: "claim_payout",
      currency,
    });

    expect(evalResult.outcome).toBe("hold");
    expect(evalResult.matched_rules.some((m) => m.rule_id === "CLM-STAFF")).toBe(
      true,
    );
    expect(evalResult.required_roles).toContain("fraud_analyst");

    const handler = checkApprovalAttempt(ladder, {
      actor_membership_id: "ins-handler",
      actor_email: "handler@demo.test",
      actor_roles: ["claims_handler"],
      is_requester: false,
      action: "approve",
      required_role: "fraud_analyst",
      required_fields: ["reason_code", "comment"],
      reason_code: "STAFF_REVIEWED",
      comment: "cleared",
    });
    expect(handler.ok).toBe(false);

    const analyst = checkApprovalAttempt(ladder, {
      actor_membership_id: "ins-fraud",
      actor_email: "fraud@demo.test",
      actor_roles: ["fraud_analyst"],
      is_requester: false,
      action: "approve",
      required_role: "fraud_analyst",
      required_fields: ["reason_code", "comment"],
      reason_code: "STAFF_REVIEWED",
      comment: "cleared after review",
    });
    expect(analyst.ok).toBe(true);

    const contentHash = policyContentHash({
      policy_id: "pol_ins_v1",
      name: pack.name,
      version: pack.version,
      combine: pack.combine,
      rules: pack.rules.map((r) => ({
        rule_id: r.rule_id,
        tool_pattern: r.tool_pattern,
        decision: r.decision,
        priority: r.priority,
        conditions: r.conditions,
      })),
    });

    const privateKey = ed.utils.randomPrivateKey();
    const publicKey = await ed.getPublicKeyAsync(privateKey);
    const keyId = "key_ins_demo";
    const sealed = {
      event_id: "evt_ins_1",
      event_hash: "sha256:insclaim1",
      sequence_num: 1,
    };
    const body = buildReceiptBody({
      organization_id: tenantId,
      seq: 1,
      prev_hash: null,
      case_id: "claim-staff-1",
      decision_id: "dec_ins_1",
      outcome: "hold",
      mode: "enforce",
      policy: {
        policy_id: "pol_ins_v1",
        version: pack.version,
        content_hash: contentHash,
      },
      matched_rules: evalResult.matched_rules.map((m) => ({
        rule_id: m.rule_id,
        policy_id: m.policy_id,
        decision: m.decision,
      })),
      sealed_events: [sealed],
      attributes: fielded.stored,
      approvals: [
        {
          actor: "fraud@demo.test",
          role: "fraud_analyst",
          decision: "approved",
          reason_code: "STAFF_REVIEWED",
        },
      ],
      key_id: keyId,
    });
    const signed = await signForensicReceipt(
      body,
      Buffer.from(privateKey).toString("base64"),
    );
    const verified = await verifyForensicBundle({
      receipts: [signed],
      sealed_events: [sealed],
      keys: { [keyId]: Buffer.from(publicKey).toString("base64") },
    });
    expect(verified.ok).toBe(true);

    // Insurance-only roles (e.g. claims_handler) do not satisfy banking ladder roles.
    // fraud_analyst exists on both packs, so it is not a cross-tenant proof.
    const banking = loadDemoPack("banking");
    const bankLadder = packRoles(banking);
    const cross = checkApprovalAttempt(bankLadder, {
      actor_membership_id: "x",
      actor_email: "claims@demo.test",
      actor_roles: ["claims_handler"],
      is_requester: false,
      action: "approve",
      required_role: "credit_manager",
    });
    expect(cross.ok).toBe(false);
  });

  it("low-value non-staff insurance claim allows without approval", () => {
    const pack = loadDemoPack("insurance");
    const result = evaluateBankEvent({
      policy_id: "pol_ins_v1",
      combine: pack.combine,
      rules: pack.rules.map((r) => ({
        rule_id: r.rule_id,
        tool_pattern: r.tool_pattern,
        decision: r.decision,
        priority: r.priority,
        conditions: r.conditions,
        obligations: r.obligations,
      })),
      tool_name: "governed.action",
      attributes: {
        amount: 500,
        currency: pack.currencies[0],
        claimant: { is_staff: false },
      },
      matrix_rows: packMatrixRows(pack),
      ladder: packRoles(pack),
      product: "claim_payout",
      currency: pack.currencies[0],
    });
    expect(result.outcome).toBe("allow");
  });
});
