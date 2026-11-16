/**
 * Prefilled bank stories for the console simulator. All data is synthetic
 * (placeholder Rwandan-style names, RWF). Each story goes through the real
 * governed intake (handleBankEvent); nothing here decides an outcome.
 *
 * Stories with a `setup` also prepare the approval the way a bank would hit it
 * (hard stop, required fields, escalation, delegation, replay after an outage).
 */

/** Amount that is within the credit officer's limit. Keep in sync with seed-story + DEMO_RUNBOOK. */
export const WITHIN_LIMIT_AMOUNT_RWF = 1_200_000;

export type SimulatorExpect = "allow" | "hold" | "stop";

export type SimulatorSetup =
  /** Sanctions / PEP: the case is stopped; only the release role can release it, with a reason. */
  | { kind: "hard_stop"; release_role: "head_of_compliance" }
  /** Approval needs these fields (e.g. callback_verified) before Approve is accepted. */
  | { kind: "required_fields"; fields: string[] }
  /** Nobody decided within the time limit (simulated time): the approval escalates to a higher role. */
  | { kind: "escalate"; to_role: "head_of_compliance"; after_minutes: number }
  /** A deputy holds a time-limited delegation of the Credit Manager role. */
  | { kind: "delegate"; window: "inside" | "outside" }
  /** The bank system lost contact with Aegis, decided under its fallback, then replayed. */
  | { kind: "unreachable_replay"; offline_minutes: number };

export type SimulatorStory = {
  id: string;
  title: string;
  /** What the presenter should expect to see. */
  expect: SimulatorExpect;
  /** One plain sentence on the expected outcome, shown on the card before and after sending. */
  expect_detail: string;
  blurb: string;
  event_type: string;
  product: string;
  agent_suffix: "credit-decision" | "payments-gateway" | "customer-data" | "core-banking";
  attributes: Record<string, unknown>;
  /** Who can resolve the hold in the demo (presenter signs in as them). */
  resolver?: string;
  setup?: SimulatorSetup;
};

export const SIMULATOR_STORIES: SimulatorStory[] = [
  {
    id: "loan_within_limit",
    title: `Loan RWF ${WITHIN_LIMIT_AMOUNT_RWF.toLocaleString("en-US")} within officer limit`,
    expect: "allow",
    expect_detail: "Allowed automatically by rule AUTH-RL. No human approval needed.",
    blurb:
      "RWF 1,200,000 school-fees loan. Within the credit officer's limit, so it is allowed automatically.",
    event_type: "loan_decision",
    product: "retail_loan",
    agent_suffix: "credit-decision",
    attributes: {
      amount: WITHIN_LIMIT_AMOUNT_RWF,
      currency: "RWF",
      applicant_name: "Uwase Aline",
      branch: "Kigali - Nyarugenge",
      loan_purpose: "School fees bridge loan",
    },
  },
  {
    id: "loan_needs_manager",
    title: "Loan RWF 18,000,000 above officer limit",
    expect: "hold",
    expect_detail:
      "Held for a Credit Manager. The officer cannot approve it; the manager can, with a reason.",
    blurb:
      "RWF 18,000,000 loan. Above the officer limit, so it is held for a Credit Manager.",
    event_type: "loan_decision",
    product: "retail_loan",
    agent_suffix: "credit-decision",
    attributes: {
      amount: 18_000_000,
      currency: "RWF",
      applicant_name: "Mukamana Divine",
      branch: "Rubavu",
      loan_purpose: "Dairy cooperative equipment",
    },
    resolver: "manager@demo.test",
  },
  {
    id: "model_override",
    title: "Override of the risk model",
    expect: "hold",
    expect_detail:
      "Held (rule LN-07). The requester cannot approve their own override; the Head of Compliance can.",
    blurb:
      "RWF 12,000,000 loan. The risk model recommends decline. The requester cannot approve their own override.",
    event_type: "loan_decision",
    product: "retail_loan",
    agent_suffix: "credit-decision",
    attributes: {
      amount: 12_000_000,
      currency: "RWF",
      applicant_name: "Niyonsenga Eric",
      branch: "Kigali - Gasabo",
      loan_purpose: "Minibus (public transport) purchase",
      model: { id: "risk-v2", version: "2.1", score: 0.82, recommendation: "decline" },
      requester_email: "officer@demo.test",
    },
    resolver: "head@demo.test",
  },
  {
    id: "kyc_data_access",
    title: "Customer data access (KYC)",
    expect: "allow",
    expect_detail: "Allowed. The national ID is masked on the record by field policy.",
    blurb:
      "KYC refresh reads a national ID. The ID is masked on the record by field policy.",
    event_type: "data_access",
    product: "customer_data",
    agent_suffix: "customer-data",
    attributes: {
      amount: 1_000_000,
      currency: "RWF",
      national_id: "1199880045123456",
      purpose: "kyc_refresh",
      applicant_name: "Ishimwe Grace",
    },
  },
  {
    id: "loan_large_decline",
    title: "Very large loan",
    expect: "hold",
    expect_detail:
      "Held for a Credit Manager, who may decline it. The case then reads: declined by name, role, date, reason.",
    blurb:
      "RWF 28,000,000 loan. Held for a Credit Manager, who may decline it for weak collateral.",
    event_type: "loan_decision",
    product: "retail_loan",
    agent_suffix: "credit-decision",
    attributes: {
      amount: 28_000_000,
      currency: "RWF",
      applicant_name: "Kamanzi Emmanuel",
      branch: "Rwamagana",
      loan_purpose: "Commercial property fit-out",
    },
    resolver: "manager@demo.test",
  },
  {
    id: "sanctions_pep_stop",
    title: "Sanctions / PEP match: hard stop",
    expect: "stop",
    expect_detail:
      "Stopped by rule SANC-01. A Credit Manager cannot release it; only the Head of Compliance can, with a reason.",
    blurb:
      "RWF 2,500,000 loan, small enough to be allowed, but screening flags the applicant as a politically exposed person. The hard-stop rule overrides the limit.",
    event_type: "loan_decision",
    product: "retail_loan",
    agent_suffix: "credit-decision",
    attributes: {
      amount: 2_500_000,
      currency: "RWF",
      applicant_name: "Test Subject (screening hit)",
      branch: "Kigali - Nyarugenge",
      loan_purpose: "Personal loan",
      screening: { sanctions_hit: false, pep_hit: true, list: "PEP watchlist (synthetic)" },
    },
    resolver: "head@demo.test",
    setup: { kind: "hard_stop", release_role: "head_of_compliance" },
  },
  {
    id: "payment_callback_unverified",
    title: "Payment callback not verified",
    expect: "hold",
    expect_detail:
      "Held by rule PAY-03. Approve is refused until the callback is verified; declining is allowed.",
    blurb:
      "RWF 4,800,000 payment release where the beneficiary bank's callback has not been verified.",
    event_type: "payment_transfer",
    product: "retail_loan",
    agent_suffix: "payments-gateway",
    attributes: {
      amount: 4_800_000,
      currency: "RWF",
      applicant_name: "Nsengiyumva Patrick",
      branch: "Kigali - Kicukiro",
      loan_purpose: "Disbursement to settlement account",
      payment: { callback_verified: false, beneficiary_bank: "Synthetic Bank Kigali" },
    },
    resolver: "manager@demo.test",
    setup: { kind: "required_fields", fields: ["callback_verified"] },
  },
  {
    id: "escalation_time_limit",
    title: "Escalation after the time limit",
    expect: "hold",
    expect_detail:
      "Held for a Credit Manager, then escalated to the Head of Compliance after 4 h 01 min (simulated time). Only the Head of Compliance can decide now.",
    blurb:
      "RWF 18,000,000 loan that nobody decided within the 4-hour limit. The simulator jumps past the limit and the approval escalates.",
    event_type: "loan_decision",
    product: "retail_loan",
    agent_suffix: "credit-decision",
    attributes: {
      amount: 18_000_000,
      currency: "RWF",
      applicant_name: "Mutesi Chantal",
      branch: "Huye",
      loan_purpose: "Agro-processing equipment",
    },
    resolver: "head@demo.test",
    setup: { kind: "escalate", to_role: "head_of_compliance", after_minutes: 241 },
  },
  {
    id: "delegate_inside_window",
    title: "Delegate approves inside the window",
    expect: "hold",
    expect_detail:
      "Held for a Credit Manager. The deputy holds a delegation that is still valid, so the deputy's approval is accepted.",
    blurb:
      "RWF 18,000,000 loan. The Credit Manager is away and delegated approval to a deputy for the next hour.",
    event_type: "loan_decision",
    product: "retail_loan",
    agent_suffix: "credit-decision",
    attributes: {
      amount: 18_000_000,
      currency: "RWF",
      applicant_name: "Uwimana Claudine",
      branch: "Musanze",
      loan_purpose: "Guesthouse extension",
    },
    resolver: "deputy@demo.test",
    setup: { kind: "delegate", window: "inside" },
  },
  {
    id: "delegate_outside_window",
    title: "Delegate refused outside the window",
    expect: "hold",
    expect_detail:
      "Held for a Credit Manager. The deputy's delegation ended a minute ago, so the deputy's approval is refused.",
    blurb:
      "Same loan, but the deputy's delegation has already expired. Approval is refused in plain words.",
    event_type: "loan_decision",
    product: "retail_loan",
    agent_suffix: "credit-decision",
    attributes: {
      amount: 18_000_000,
      currency: "RWF",
      applicant_name: "Bizimana Theoneste",
      branch: "Nyagatare",
      loan_purpose: "Irrigation pumps",
    },
    resolver: "deputy@demo.test",
    setup: { kind: "delegate", window: "outside" },
  },
  {
    id: "unreachable_replayed",
    title: "Aegis unreachable, then replayed",
    expect: "allow",
    expect_detail:
      "Allowed and sealed. The receipt is marked decided without Aegis, with the 8-minute outage and the replay in the timeline.",
    blurb:
      "The bank system loses contact with Aegis, decides under its fallback and queues the event. When the link returns the event is replayed and sealed.",
    event_type: "loan_decision",
    product: "retail_loan",
    agent_suffix: "core-banking",
    attributes: {
      amount: WITHIN_LIMIT_AMOUNT_RWF,
      currency: "RWF",
      applicant_name: "Ingabire Solange",
      branch: "Kigali - Kicukiro",
      loan_purpose: "Working capital top-up",
    },
    setup: { kind: "unreachable_replay", offline_minutes: 8 },
  },
];

export function getSimulatorStory(id: string): SimulatorStory | undefined {
  return SIMULATOR_STORIES.find((s) => s.id === id);
}
