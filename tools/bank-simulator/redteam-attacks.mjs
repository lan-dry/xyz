/**
 * Stage 8 Red Team attack catalog (#1–18) + honest limits.
 * Buttons prefer live Aegis calls via RealConnectors / ingest; anything that
 * cannot run live returns simulated:true and must be labelled Simulation.
 */

import { runLiveAttack } from "./redteam-live.mjs";

/** @typedef {{
 *   id: number,
 *   title: string,
 *   attacker_gains: string,
 *   expected: string,
 *   mode: "live"|"local"|"hybrid",
 *   coverage: "api_test"|"simulator"|"both"
 * }} AttackDef */

/** @type {AttackDef[]} */
export const ATTACKS = [
  {
    id: 1,
    title: "Forged event with a made-up signature",
    attacker_gains: "Inject a fake loan decision that looks source-signed.",
    expected: "Rejected at ingest (bad_signature).",
    mode: "live",
    coverage: "both",
  },
  {
    id: 2,
    title: "Event signed with a revoked or unknown key",
    attacker_gains: "Use a discarded or unregistered key to impersonate a source.",
    expected: "Rejected (key_revoked / unknown_key).",
    mode: "live",
    coverage: "both",
  },
  {
    id: 3,
    title: "Replay of a valid old event",
    attacker_gains: "Re-submit an old approved event to trigger a second pay-out.",
    expected:
      "Identical replay: seq_replay or idempotent 200; new idempotency_key same seq → seq_replay; reused nonce → nonce_reused.",
    mode: "live",
    coverage: "both",
  },
  {
    id: 4,
    title: "Attacker with only the shared ingest key sends events",
    attacker_gains: "Impersonate the bank using the transport key alone.",
    expected:
      "Rejected when signing is required; otherwise G0 and labelled asserted_by_source.",
    mode: "live",
    coverage: "both",
  },
  {
    id: 5,
    title: "LOS asks for approval on 4,000,000 but core executes 18,000,000",
    attacker_gains: "Approve a small amount, then disburse a larger one.",
    expected: "Confirm refused; execution_mismatch sealed.",
    mode: "live",
    coverage: "both",
  },
  {
    id: 6,
    title: "Core executes with no token at all (bypass)",
    attacker_gains: "Pay without any Aegis decision token.",
    expected:
      "Core refuses; if forced at database level, executed_without_receipt on next reconciliation.",
    mode: "live",
    coverage: "both",
  },
  {
    id: 7,
    title: "Token reused for a second disbursement",
    attacker_gains: "Cash the same approval twice.",
    expected: "Refused (token already used).",
    mode: "live",
    coverage: "both",
  },
  {
    id: 8,
    title: "Execution after the case was stopped",
    attacker_gains: "Pay a hard-stopped loan.",
    expected: "Refused and flagged (stopped).",
    mode: "live",
    coverage: "both",
  },
  {
    id: 9,
    title: "Approver swapped in the database after approval",
    attacker_gains: "Rewrite who approved a decision after the fact.",
    expected: "Verification fails; bundle check names the field.",
    mode: "hybrid",
    coverage: "api_test",
  },
  {
    id: 10,
    title: "Requester approves own request",
    attacker_gains: "Bypass four-eyes control.",
    expected: "Blocked by separation of duties.",
    mode: "hybrid",
    coverage: "both",
  },
  {
    id: 11,
    title: "Insider edits the ledger directly in Postgres",
    attacker_gains: "Change a posted amount without an application event.",
    expected: "db_change_without_event from the collector (or flagged locally).",
    mode: "live",
    coverage: "both",
  },
  {
    id: 12,
    title: "LOS reports a better credit score than the bureau signed",
    attacker_gains: "Inflate the score used by policy while keeping a bureau envelope.",
    expected: "fact_mismatch; signed value used.",
    mode: "live",
    coverage: "both",
  },
  {
    id: 13,
    title: "Ledger feed row edited after the fact",
    attacker_gains: "Alter the exported feed so reconciliation looks clean.",
    expected: "Reconciliation detects on next run.",
    mode: "live",
    coverage: "both",
  },
  {
    id: 14,
    title: "A source goes silent",
    attacker_gains: "Hide activity by stopping heartbeats / events.",
    expected: "source_silent after its interval.",
    mode: "hybrid",
    coverage: "both",
  },
  {
    id: 15,
    title: "Aegis unavailable during execution",
    attacker_gains: "Force the bank to pay while Aegis is down (or block it).",
    expected:
      "Behaves per workflow policy; allow_and_flag listed until reconciled; bank never penalised for outage.",
    mode: "hybrid",
    coverage: "both",
  },
  {
    id: 16,
    title: "Connector crash and restart mid-send",
    attacker_gains: "Cause duplicate delivery or sequence reuse.",
    expected: "No duplicate, no sequence reuse, nothing lost.",
    mode: "live",
    coverage: "both",
  },
  {
    id: 17,
    title: "Tamper with a stored receipt, token or bundle",
    attacker_gains: "Alter sealed evidence after the fact.",
    expected: "Verification fails.",
    mode: "hybrid",
    coverage: "api_test",
  },
  {
    id: 18,
    title: "Old pre-change bundle",
    attacker_gains: "Pass off a legacy bundle as a higher grade.",
    expected: "Verifies as G0 legacy.",
    mode: "hybrid",
    coverage: "api_test",
  },
];

export const HONEST_LIMIT = {
  id: "honest_limit",
  title: "Consistently false signed value (honest limit)",
  attacker_gains:
    "A compromised source signs the same wrong amount every time — no second record to compare.",
  expected:
    'Case stays G1, labelled "signed by source, not corroborated". Raise with G2 (reconcile/execute match), G3 (collector), or signed third-party facts.',
  what_aegis_does_not_catch:
    "Aegis does not check that the data is accurate. A valid signature on a false value remains G1.",
};

/**
 * Run attack — prefers live Aegis / Connectors; labels Simulation when it cannot.
 * @param {number|string} attackId
 * @param {{
 *   core: import('./core-ledger.mjs').CoreLedger,
 *   connectors: import('./connectors-sim.mjs').SimulatedConnectors,
 *   realConnectors?: import('./real-connectors.mjs').RealConnectors,
 *   postJson?: Function,
 *   cfg?: Function,
 * }} deps
 */
export async function runAttack(attackId, deps) {
  const id = Number(attackId);
  const def = ATTACKS.find((a) => a.id === id);
  if (!def && attackId !== "honest_limit") {
    return { ok: false, error: "Unknown attack", status: 404 };
  }

  const partial = await runLiveAttack(attackId, deps);
  if (partial && partial.ok === false) return partial;

  return {
    ok: partial.ok !== false,
    attack: def ?? HONEST_LIMIT,
    ran_at: new Date().toISOString(),
    simulated: partial.simulated === true,
    label: partial.label ?? (partial.simulated ? "Simulation" : "Live"),
    report_status: partial.report_status ?? (partial.simulated ? "Simulated" : "Live"),
    steps: partial.steps ?? [],
    result: partial.result ?? "",
    evidence: partial.evidence ?? {},
  };
}
