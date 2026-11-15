#!/usr/bin/env node
/**
 * Forensic demo scenarios (unit-level). Usage:
 *   pnpm --filter aegis-api scenario:run
 *   pnpm --filter aegis-api scenario:run -- 1,2,3
 */
import * as ed from "@noble/ed25519";
import { evaluateBankEvent } from "../bank/evaluate.js";
import {
  DEFAULT_RETAIL_LOAN_LADDER,
  DEFAULT_RETAIL_LOAN_MATRIX,
  type AuthorityMatrixRow,
} from "../bank/authority-matrix.js";
import { checkApprovalAttempt } from "../bank/approvals-guard.js";
import {
  buildReceiptBody,
  signForensicReceipt,
} from "../forensic/receipt.js";
import { verifyForensicBundle } from "../forensic/verify-bundle.js";

const matrix: AuthorityMatrixRow[] = DEFAULT_RETAIL_LOAN_MATRIX.map((r, i) => ({
  ...r,
  matrix_id: `m${i}`,
}));
const ladder = DEFAULT_RETAIL_LOAN_LADDER;

type ScenarioResult = { id: number; name: string; ok: boolean; detail: string };

async function keyPair() {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  return {
    privateKeyB64: Buffer.from(privateKey).toString("base64"),
    publicKeyB64: Buffer.from(publicKey).toString("base64"),
    keyId: "key_scenario",
  };
}

function scenario1(): ScenarioResult {
  const r = evaluateBankEvent({
    policy_id: "pol_v3",
    combine: "all_matching",
    rules: [
      {
        rule_id: "AUTH-RL",
        tool_pattern: "bank.loan.decide",
        decision: "allow",
        priority: 10,
      },
    ],
    tool_name: "bank.loan.decide",
    attributes: { amount: 3_000_000, currency: "RWF" },
    matrix_rows: matrix,
    ladder,
    product: "retail_loan",
  });
  const ok =
    r.outcome === "allow" &&
    r.matched_rules.some((m) => m.rule_id === "AUTH-RL");
  return {
    id: 1,
    name: "allow AUTH-RL",
    ok,
    detail: `${r.outcome} rules=${r.matched_rules.map((m) => m.rule_id).join(",")}`,
  };
}

function scenario2(): ScenarioResult {
  const r = evaluateBankEvent({
    policy_id: "pol_v3",
    combine: "all_matching",
    rules: [],
    tool_name: "bank.loan.decide",
    attributes: { amount: 18_000_000, currency: "RWF" },
    matrix_rows: matrix,
    ladder,
    product: "retail_loan",
  });
  const officer = checkApprovalAttempt(ladder, {
    actor_membership_id: "m1",
    actor_email: "jean.officer@bank.test",
    actor_roles: ["credit_officer"],
    is_requester: false,
    action: "approve",
    required_role: "credit_manager",
  });
  const manager = checkApprovalAttempt(ladder, {
    actor_membership_id: "m2",
    actor_email: "grace.manager@bank.test",
    actor_roles: ["credit_manager"],
    is_requester: false,
    action: "approve",
    required_role: "credit_manager",
  });
  const ok =
    r.outcome === "hold" &&
    r.required_roles.includes("credit_manager") &&
    !officer.ok &&
    manager.ok;
  return {
    id: 2,
    name: "hold credit_manager",
    ok,
    detail: `outcome=${r.outcome} officer=${!officer.ok} manager=${manager.ok}`,
  };
}

function scenario3(): ScenarioResult {
  const r = evaluateBankEvent({
    policy_id: "pol_v3",
    combine: "all_matching",
    rules: [
      {
        rule_id: "LN-07",
        tool_pattern: "bank.loan.decide",
        decision: "allow_with_obligation",
        priority: 50,
        obligations: { kind: "human_approval", required_role: "credit_manager" },
        conditions: {
          expr: { gt: ["model.score", 0.7] },
        },
      },
    ],
    tool_name: "bank.loan.decide",
    attributes: {
      amount: 12_000_000,
      currency: "RWF",
      model: {
        id: "risk-v2",
        version: "2.1",
        score: 0.82,
        recommendation: "decline",
      },
    },
    matrix_rows: matrix,
    ladder,
    product: "retail_loan",
  });
  const self = checkApprovalAttempt(ladder, {
    actor_membership_id: "m1",
    actor_email: "requester@bank.test",
    actor_roles: ["credit_manager"],
    is_requester: true,
    action: "approve",
    required_role: "credit_manager",
    required_fields: ["reason_code", "comment"],
  });
  const noReason = checkApprovalAttempt(ladder, {
    actor_membership_id: "m2",
    actor_email: "grace.manager@bank.test",
    actor_roles: ["credit_manager"],
    is_requester: false,
    action: "approve",
    required_role: "credit_manager",
    required_fields: ["reason_code", "comment"],
    comment: "ok",
  });
  const okApprove = checkApprovalAttempt(ladder, {
    actor_membership_id: "m2",
    actor_email: "grace.manager@bank.test",
    actor_roles: ["credit_manager"],
    is_requester: false,
    action: "approve",
    required_role: "credit_manager",
    required_fields: ["reason_code", "comment"],
    reason_code: "MODEL_OVERRIDE",
    comment: "history supports",
  });
  const ok =
    r.outcome === "hold" &&
    r.matched_rules.some((m) => m.rule_id === "LN-07") &&
    !self.ok &&
    !noReason.ok &&
    okApprove.ok;
  return {
    id: 3,
    name: "LN-07 model override",
    ok,
    detail: `hold=${r.outcome === "hold"} guards ok`,
  };
}

function scenario6(): ScenarioResult {
  const bad = checkApprovalAttempt(ladder, {
    actor_membership_id: "m1",
    actor_email: "ops@bank.test",
    actor_roles: ["credit_manager"],
    is_requester: false,
    action: "approve",
    required_fields: ["callback_verified"],
    callback_verified: false,
  });
  const reject = checkApprovalAttempt(ladder, {
    actor_membership_id: "m1",
    actor_email: "ops@bank.test",
    actor_roles: ["credit_manager"],
    is_requester: false,
    action: "reject",
    required_fields: ["callback_verified"],
    callback_verified: false,
    comment: "callback failed",
  });
  return {
    id: 6,
    name: "PAY-03 callback",
    ok: !bad.ok && reject.ok,
    detail: `approve_refused=${!bad.ok} reject_ok=${reject.ok}`,
  };
}

function scenario7(): ScenarioResult {
  const manager = checkApprovalAttempt(ladder, {
    actor_membership_id: "m1",
    actor_email: "grace.manager@bank.test",
    actor_roles: ["credit_manager"],
    is_requester: false,
    action: "release",
    hard_stop: true,
  });
  const headNoReason = checkApprovalAttempt(ladder, {
    actor_membership_id: "m2",
    actor_email: "david.headcompliance@bank.test",
    actor_roles: ["head_of_compliance"],
    is_requester: false,
    action: "release",
    hard_stop: true,
  });
  const released = checkApprovalAttempt(ladder, {
    actor_membership_id: "m2",
    actor_email: "david.headcompliance@bank.test",
    actor_roles: ["head_of_compliance"],
    is_requester: false,
    action: "release",
    hard_stop: true,
    reason_code: "FALSE_POSITIVE",
  });
  return {
    id: 7,
    name: "hard stop release",
    ok: !manager.ok && !headNoReason.ok && released.ok,
    detail: "release guards",
  };
}

async function scenario12(): Promise<ScenarioResult> {
  const keys = await keyPair();
  const receipts = [];
  let prev: string | null = null;
  for (let i = 0; i < 5; i++) {
    const body = buildReceiptBody({
      organization_id: "00000000-0000-0000-0000-000000000001",
      seq: i + 1,
      prev_hash: prev,
      case_id: `c${i + 1}`,
      decision_id: `d${i + 1}`,
      outcome: "allow",
      mode: "enforce",
      matched_rules: [],
      sealed_events: [
        {
          event_id: `e${i + 1}`,
          event_hash: `sha256:${i}`,
          sequence_num: i + 1,
        },
      ],
      key_id: keys.keyId,
    });
    const signed = await signForensicReceipt(body, keys.privateKeyB64);
    receipts.push(signed);
    prev = signed.receipt_hash;
  }
  const good = await verifyForensicBundle({
    receipts,
    sealed_events: receipts.map((r) => r.sealed_events[0]!),
    keys: { [keys.keyId]: keys.publicKeyB64 },
  });
  const tampered = structuredClone(receipts);
  tampered[0]!.outcome = "stop";
  const bad = await verifyForensicBundle({
    receipts: tampered,
    keys: { [keys.keyId]: keys.publicKeyB64 },
  });
  return {
    id: 12,
    name: "receipt bundle + tamper",
    ok: good.ok && !bad.ok,
    detail: `valid=${good.ok} tamper_detected=${!bad.ok}`,
  };
}

const runners: Record<number, () => ScenarioResult | Promise<ScenarioResult>> = {
  1: scenario1,
  2: scenario2,
  3: scenario3,
  6: scenario6,
  7: scenario7,
  12: scenario12,
};

async function main() {
  const arg = process.argv[2] ?? "all";
  const ids =
    arg === "all"
      ? Object.keys(runners).map(Number)
      : arg.split(",").map((s) => Number(s.trim()));
  let failed = 0;
  for (const id of ids) {
    const run = runners[id];
    if (!run) {
      console.log(`SKIP ${id} (not implemented in unit runner yet)`);
      continue;
    }
    const result = await run();
    console.log(
      `${result.ok ? "PASS" : "FAIL"} scenario ${result.id} ${result.name} — ${result.detail}`,
    );
    if (!result.ok) failed++;
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
