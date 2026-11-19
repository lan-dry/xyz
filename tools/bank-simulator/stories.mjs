/**
 * Prefilled bank stories: stable ids and titles, synthetic Rwandan-style names, RWF amounts.
 * Every story goes through the real governed intake; nothing here decides an outcome.
 * Outcomes come back from the API (also used by tools/demo/demo-rehearse.mjs).
 */

export const WITHIN_LIMIT_AMOUNT_RWF = 1_200_000;

/** Default requester: Credit Officer (screens show name · role; email stays technical). */
const OFFICER_REQUESTER = {
  requester_email: "officer@demo.test",
  requester_name: "Patience Ingabire",
  requester_role: "credit_officer",
  officer_id: "OFF-1042",
  system_account: "core-banking",
};

/** Model override: manager requested the override → SoD blocks self-approve. */
const MANAGER_REQUESTER = {
  requester_email: "manager@demo.test",
  requester_name: "Jean Mutabazi",
  requester_role: "credit_manager",
  officer_id: "MGR-2201",
  system_account: "core-banking",
};

export const STORIES = [
  {
    id: "loan_within_limit",
    title: `Loan RWF ${WITHIN_LIMIT_AMOUNT_RWF.toLocaleString("en-US")} within officer limit`,
    expect: "allow",
    expect_detail: "Allowed automatically by rule AUTH-RL-1. No human approval needed.",
    blurb:
      "RWF 1,200,000 school-fees loan. Within the credit officer's limit, so it is allowed automatically. After execute + reconcile → G2.",
    target_grade: "G2",
    event_type: "loan_decision",
    product: "retail_loan",
    agent_slug: "credit-decision",
    attributes: {
      ...OFFICER_REQUESTER,
      amount: WITHIN_LIMIT_AMOUNT_RWF,
      currency: "RWF",
      beneficiary_account: "ACCT-DEMO-001",
      product: "retail_loan",
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
      "Held for a Credit Manager. The officer cannot approve it; the manager can, with a reason. Approve + token confirm + reconcile → G2.",
    blurb: "RWF 18,000,000 loan. Above the officer limit, so it is held for a Credit Manager.",
    target_grade: "G2",
    event_type: "loan_decision",
    product: "retail_loan",
    agent_slug: "credit-decision",
    attributes: {
      ...OFFICER_REQUESTER,
      amount: 18_000_000,
      currency: "RWF",
      applicant_name: "Mukamana Divine",
      branch: "Rubavu",
      loan_purpose: "Dairy cooperative equipment",
    },
    resolver: "Credit Manager",
  },
  {
    id: "loan_large_with_cdc",
    title: "Large loan with CDC match (G3)",
    expect: "hold",
    expect_detail:
      "Same large loan path; when collector matches the core ledger row → G3 (Partial if collector is Partial).",
    blurb:
      "RWF 18,000,000 with independent capture on the core ledger. Target grade G3 when CDC is live.",
    target_grade: "G3",
    event_type: "loan_decision",
    product: "retail_loan",
    agent_slug: "credit-decision",
    attributes: {
      ...OFFICER_REQUESTER,
      amount: 18_000_000,
      currency: "RWF",
      applicant_name: "Habimana Claire",
      branch: "Musanze",
      loan_purpose: "Cold-storage construction",
      cdc_expected: true,
    },
    resolver: "Credit Manager",
  },
  {
    id: "loan_policy_stop",
    title: "Loan stopped by policy (executor refuses)",
    expect: "stop",
    expect_detail: "Hard stop. Executor must refuse disbursement.",
    blurb: "RWF 50,000,000 — over hard limit; policy stops. Core ledger must refuse.",
    target_grade: "G1",
    event_type: "loan_decision",
    product: "retail_loan",
    agent_slug: "credit-decision",
    attributes: {
      ...OFFICER_REQUESTER,
      amount: 50_000_000,
      currency: "RWF",
      applicant_name: "Nsengiyumva Paul",
      branch: "Huye",
      loan_purpose: "Over-limit attempt",
      force_stop: true,
    },
  },
  {
    id: "source_silent_flag",
    title: "Source silent flag",
    expect: "allow",
    expect_detail: "Story documents source_silent; raise via reconciliation when a source misses its interval.",
    blurb: "Demonstrates the source_silent exception path (no heartbeat).",
    target_grade: "G0",
    event_type: "loan_decision",
    product: "retail_loan",
    agent_slug: "credit-decision",
    attributes: {
      ...OFFICER_REQUESTER,
      amount: WITHIN_LIMIT_AMOUNT_RWF,
      currency: "RWF",
      applicant_name: "Silent Source Demo",
      branch: "Kigali - Kicukiro",
      loan_purpose: "Heartbeat gap demo",
      source_silent_demo: true,
    },
  },
  {
    id: "model_override",
    title: "Override of the risk model",
    expect: "hold",
    expect_detail:
      "Held (rule LN-07). The requester cannot approve their own override; the Head of Compliance can.",
    blurb:
      "RWF 12,000,000 loan. The risk model recommends decline, and a person is overriding it.",
    event_type: "loan_decision",
    product: "retail_loan",
    agent_slug: "credit-decision",
    attributes: {
      ...MANAGER_REQUESTER,
      amount: 12_000_000,
      currency: "RWF",
      applicant_name: "Niyonsenga Eric",
      branch: "Kigali - Gasabo",
      loan_purpose: "Minibus (public transport) purchase",
      model: { id: "risk-v2", version: "2.1", score: 0.82, recommendation: "decline" },
    },
    resolver: "Head of Compliance",
  },
  {
    id: "kyc_data_access",
    title: "Customer data access (KYC)",
    expect: "allow",
    expect_detail: "Allowed. The national ID is masked on the record by field policy.",
    blurb: "KYC refresh reads a national ID. The ID is masked on the record by field policy.",
    event_type: "data_access",
    product: "customer_data",
    agent_slug: "customer-data",
    attributes: {
      ...OFFICER_REQUESTER,
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
    blurb: "RWF 28,000,000 loan. Held for a Credit Manager, who may decline it for weak collateral.",
    event_type: "loan_decision",
    product: "retail_loan",
    agent_slug: "credit-decision",
    attributes: {
      ...OFFICER_REQUESTER,
      amount: 28_000_000,
      currency: "RWF",
      applicant_name: "Kamanzi Emmanuel",
      branch: "Rwamagana",
      loan_purpose: "Commercial property fit-out",
    },
    resolver: "Credit Manager",
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
    agent_slug: "credit-decision",
    attributes: {
      ...OFFICER_REQUESTER,
      amount: 2_500_000,
      currency: "RWF",
      applicant_name: "Test Subject (screening hit)",
      branch: "Kigali - Nyarugenge",
      loan_purpose: "Personal loan",
      screening: { sanctions_hit: false, pep_hit: true, list: "PEP watchlist (synthetic)" },
    },
    resolver: "Head of Compliance",
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
    agent_slug: "payments-gateway",
    attributes: {
      ...OFFICER_REQUESTER,
      amount: 4_800_000,
      currency: "RWF",
      applicant_name: "Nsengiyumva Patrick",
      branch: "Kigali - Kicukiro",
      loan_purpose: "Disbursement to settlement account",
      payment: { callback_verified: false, beneficiary_bank: "Synthetic Bank Kigali" },
    },
    resolver: "Credit Manager",
  },
  {
    id: "escalation_time_limit",
    title: "Escalation after the time limit",
    expect: "hold",
    expect_detail:
      "Held for a Credit Manager. If nobody decides within 2 minutes (configuration on this tenant's held loan rules) it escalates to the Head of Compliance.",
    blurb:
      "RWF 18,000,000 loan. Send it, then leave it. After 2 real minutes the approval escalates. Open the Approvals page to see it move.",
    event_type: "loan_decision",
    product: "retail_loan",
    agent_slug: "credit-decision",
    attributes: {
      ...OFFICER_REQUESTER,
      amount: 18_000_000,
      currency: "RWF",
      applicant_name: "Mutesi Chantal",
      branch: "Huye",
      loan_purpose: "Agro-processing equipment",
    },
    resolver: "Head of Compliance (after escalation)",
  },
  {
    id: "delegate_inside_window",
    title: "Delegate approves inside the window",
    expect: "hold",
    expect_detail:
      "Held for a Credit Manager. The deputy holds a delegation that is still valid, so the deputy's approval is accepted and the receipt names both people.",
    blurb:
      "RWF 18,000,000 loan. First open Delegations in the console and have the Credit Manager delegate their role to the deputy for 1 hour, then send this case and approve as the deputy.",
    event_type: "loan_decision",
    product: "retail_loan",
    agent_slug: "credit-decision",
    attributes: {
      ...OFFICER_REQUESTER,
      amount: 18_000_000,
      currency: "RWF",
      applicant_name: "Uwimana Claudine",
      branch: "Musanze",
      loan_purpose: "Guesthouse extension",
    },
    resolver: "Deputy (with a delegation)",
    console_hint: "/aegis/delegations",
  },
  {
    id: "delegate_outside_window",
    title: "Delegate refused outside the window",
    expect: "hold",
    expect_detail:
      "Held for a Credit Manager. Once the deputy's delegation has ended (or was revoked) the deputy's approval is refused in plain words.",
    blurb:
      "Same loan. End the deputy's delegation on the Delegations page (or let it run out), then try to approve as the deputy.",
    event_type: "loan_decision",
    product: "retail_loan",
    agent_slug: "credit-decision",
    attributes: {
      ...OFFICER_REQUESTER,
      amount: 18_000_000,
      currency: "RWF",
      applicant_name: "Bizimana Theoneste",
      branch: "Nyagatare",
      loan_purpose: "Irrigation pumps",
    },
    resolver: "Deputy (delegation ended)",
    console_hint: "/aegis/delegations",
  },
  {
    id: "unreachable_replayed",
    title: "Aegis unreachable, then replayed",
    expect: "allow",
    expect_detail:
      "Turn on 'Aegis unreachable', send this case: the bank proceeds under its own fallback and the event is queued. Turn it off: the queue is replayed and the receipt is marked decided without Aegis.",
    blurb:
      "The bank system loses contact with Aegis, decides under its fallback and queues the event. When the link returns the event is replayed and sealed.",
    event_type: "loan_decision",
    product: "retail_loan",
    agent_slug: "core-banking",
    attributes: {
      ...OFFICER_REQUESTER,
      amount: WITHIN_LIMIT_AMOUNT_RWF,
      currency: "RWF",
      applicant_name: "Ingabire Solange",
      branch: "Kigali - Kicukiro",
      loan_purpose: "Working capital top-up",
    },
    needs_offline: true,
  },
  {
    id: "wrong_key",
    title: "Wrong ingest key",
    expect: "reject",
    expect_detail:
      "Aegis refuses the request with HTTP 401 and records nothing: no case is created. Check the panel below for the status and body.",
    blurb:
      "The bank system sends an ordinary loan event but with a key Aegis does not know. The request must be refused with HTTP 401.",
    event_type: "loan_decision",
    product: "retail_loan",
    agent_slug: "credit-decision",
    attributes: {
      ...OFFICER_REQUESTER,
      amount: WITHIN_LIMIT_AMOUNT_RWF,
      currency: "RWF",
      applicant_name: "Test Subject (bad credential)",
      branch: "Kigali - Nyarugenge",
      loan_purpose: "Credential check",
    },
    wrong_key: true,
  },
];

export function getStory(id) {
  return STORIES.find((s) => s.id === id);
}
