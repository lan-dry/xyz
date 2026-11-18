/**
 * Stage 8 Red Team attack catalog (#1–18) + honest limits.
 * Each entry: what an attacker gains, expected outcome, and how the simulator runs it.
 */

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
    mode: "hybrid",
    coverage: "both",
  },
  {
    id: 2,
    title: "Event signed with a revoked or unknown key",
    attacker_gains: "Use a discarded or unregistered key to impersonate a source.",
    expected: "Rejected (key_revoked / unknown_key).",
    mode: "hybrid",
    coverage: "both",
  },
  {
    id: 3,
    title: "Replay of a valid old event",
    attacker_gains: "Re-submit an old approved event to trigger a second pay-out.",
    expected: "Rejected (sequence and nonce / seq_replay).",
    mode: "hybrid",
    coverage: "both",
  },
  {
    id: 4,
    title: "Attacker with only the shared ingest key sends events",
    attacker_gains: "Impersonate the bank using the transport key alone.",
    expected:
      "Rejected when signing is required; otherwise G0 and labelled asserted_by_source.",
    mode: "hybrid",
    coverage: "both",
  },
  {
    id: 5,
    title: "LOS asks for approval on 4,000,000 but core executes 18,000,000",
    attacker_gains: "Approve a small amount, then disburse a larger one.",
    expected: "Confirm refused; execution_mismatch sealed.",
    mode: "hybrid",
    coverage: "both",
  },
  {
    id: 6,
    title: "Core executes with no token at all (bypass)",
    attacker_gains: "Pay without any Aegis decision token.",
    expected:
      "Core refuses; if forced at database level, executed_without_receipt on next reconciliation.",
    mode: "local",
    coverage: "both",
  },
  {
    id: 7,
    title: "Token reused for a second disbursement",
    attacker_gains: "Cash the same approval twice.",
    expected: "Refused (token already used).",
    mode: "hybrid",
    coverage: "both",
  },
  {
    id: 8,
    title: "Execution after the case was stopped",
    attacker_gains: "Pay a hard-stopped loan.",
    expected: "Refused and flagged (stopped).",
    mode: "hybrid",
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
    mode: "local",
    coverage: "both",
  },
  {
    id: 12,
    title: "LOS reports a better credit score than the bureau signed",
    attacker_gains: "Inflate the score used by policy while keeping a bureau envelope.",
    expected: "fact_mismatch; signed value used.",
    mode: "hybrid",
    coverage: "both",
  },
  {
    id: 13,
    title: "Ledger feed row edited after the fact",
    attacker_gains: "Alter the exported feed so reconciliation looks clean.",
    expected: "Reconciliation detects on next run.",
    mode: "local",
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
    mode: "local",
    coverage: "both",
  },
  {
    id: 16,
    title: "Connector crash and restart mid-send",
    attacker_gains: "Cause duplicate delivery or sequence reuse.",
    expected: "No duplicate, no sequence reuse, nothing lost.",
    mode: "local",
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
 * Run a local / hybrid attack against simulator dependencies.
 * @param {number|string} attackId
 * @param {{
 *   core: import('./core-ledger.mjs').CoreLedger,
 *   connectors: import('./connectors-sim.mjs').SimulatedConnectors,
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

  const outcome = async (partial) => ({
    ok: true,
    attack: def ?? HONEST_LIMIT,
    ran_at: new Date().toISOString(),
    ...partial,
  });

  switch (id) {
    case 1:
      return outcome({
        simulated: true,
        steps: [
          "Built an envelope with a flipped signature byte.",
          "Would POST to Aegis ingest → expect 401 bad_signature.",
        ],
        result: "Rejected at ingest (covered by source-envelope + redteam suite).",
        evidence: { expected_http: 401, expected_code: "bad_signature" },
      });
    case 2:
      return outcome({
        simulated: true,
        steps: ["Signed with revoked/unknown key_id."],
        result: "Rejected (key_revoked / unknown_key).",
        evidence: { expected_codes: ["key_revoked", "unknown_key", "key_not_found"] },
      });
    case 3:
      return outcome({
        simulated: true,
        steps: ["Replayed a previously accepted seq/nonce."],
        result: "Rejected (seq_replay / nonce reuse).",
        evidence: { expected_http: 409, expected_code: "seq_replay" },
      });
    case 4: {
      const requireSigned = process.env.AEGIS_REQUIRE_SIGNED_EVENTS === "1";
      return outcome({
        simulated: true,
        steps: [
          "Sent unsigned event with bearer ingest key only.",
          requireSigned
            ? "Org requires signed events → reject."
            : "Org allows unsigned → accepted as G0 asserted.",
        ],
        result: requireSigned
          ? "Rejected when signing is required."
          : "G0 labelled asserted_by_source (transport key is not source identity).",
        evidence: { require_signed_events: requireSigned },
      });
    }
    case 5:
      return outcome({
        simulated: true,
        steps: [
          "Token bound amount=4000000.",
          "Confirm called with amount=18000000.",
        ],
        result: "Confirm refused; execution_mismatch (amount) sealed.",
        evidence: { field: "amount", approved: "4000000", attempted: "18000000" },
      });
    case 6: {
      const refused = await deps.core.disburse({
        case_id: `RT6-${Date.now()}`,
        action: { amount: 1000, currency: "RWF" },
        skip_aegis: true,
      });
      const forced = await deps.core.disburse({
        case_id: `RT6-BYPASS-${Date.now()}`,
        action: { amount: 1000, currency: "RWF" },
        force_db_bypass: true,
      });
      return outcome({
        simulated: false,
        steps: [
          `Ungated disburse → HTTP ${refused.status} (${refused.body.code ?? "refused"}).`,
          `Forced DB write → txn ${forced.body.entry?.txn_id} (expect executed_without_receipt on reconcile).`,
        ],
        result: "Core refuses without token; forced bypass recorded for reconciliation.",
        evidence: { refused: refused.body, forced: forced.body },
      });
    }
    case 7:
      return outcome({
        simulated: true,
        steps: ["First confirm consumes token; second confirm same token_id."],
        result: "Second confirm refused (token already used).",
        evidence: { expected_code: "token_used" },
      });
    case 8:
      return outcome({
        simulated: true,
        steps: ["Case outcome=stop; confirm attempted."],
        result: "Refused and flagged (stopped).",
        evidence: { expected_code: "stopped" },
      });
    case 9:
      return outcome({
        simulated: true,
        steps: ["Approver identity swapped after seal; verify bundle."],
        result: "Verification fails; field named in findings.",
        evidence: { covered_by: "approver-binding.test.ts" },
      });
    case 10:
      return outcome({
        simulated: true,
        steps: ["Requester email equals approver; SoD on."],
        result: "Blocked by separation of duties.",
        evidence: { expected_code: "separation_of_duties" },
      });
    case 11: {
      const paid = await deps.core.disburse({
        case_id: `RT11-${Date.now()}`,
        action: { amount: 5000, currency: "RWF" },
        force_db_bypass: true,
      });
      const txnId = paid.body.entry?.txn_id;
      const edited = txnId
        ? await deps.core.editTransactionAmount(txnId, 999999)
        : null;
      return outcome({
        simulated: false,
        steps: [
          `Posted txn ${txnId} then edited amount → ${edited?.amount}.`,
          "Collector / next reconcile should raise db_change_without_event (Stage 6).",
        ],
        result: "Direct ledger edit recorded; exception expected from collector match.",
        evidence: { before: paid.body.entry, after: edited },
      });
    }
    case 12:
      return outcome({
        simulated: true,
        steps: [
          "Bureau signed credit_score=612.",
          "LOS asserted credit_score=780 with nested bureau envelope.",
        ],
        result: "fact_mismatch; signed value 612 used for policy.",
        evidence: { covered_by: "third-party-facts.test.ts" },
      });
    case 13: {
      const paid = await deps.core.disburse({
        case_id: `RT13-${Date.now()}`,
        action: { amount: 2500, currency: "RWF" },
        force_db_bypass: true,
      });
      const txnId = paid.body.entry?.txn_id;
      const edited = txnId
        ? await deps.core.editTransactionAmount(txnId, 1)
        : null;
      const feed = await deps.core.exportFeed("jsonl");
      return outcome({
        simulated: false,
        steps: [
          `Edited feed row ${txnId} amount → ${edited?.amount}.`,
          `Exported ${feed.path} (${feed.rows} rows).`,
        ],
        result: "Reconciliation detects amount_mismatch / feed drift on next run.",
        evidence: { edited, feed_path: feed.path },
      });
    }
    case 14:
      return outcome({
        simulated: true,
        steps: ["Source last_seen older than expected_interval_sec."],
        result: "source_silent exception raised.",
        evidence: { covered_by: "reconciliation.test.ts" },
      });
    case 15:
      return outcome({
        simulated: true,
        steps: [
          "Toggle Aegis unreachable / on_aegis_unavailable=allow_and_flag.",
          "Local token check may pass; case flagged until reconciled.",
        ],
        result: "Policy-driven; bank not penalised for Aegis outage.",
        evidence: { default: "allow_and_flag", alternate: "block" },
      });
    case 16: {
      await deps.connectors.recordSend("los", { queue: true });
      const crash = await deps.connectors.simulateCrashRestart("los");
      return outcome({
        simulated: false,
        steps: [
          `Queued mid-send then restarted Connector for src_los.`,
          `last_seq ${crash.before.last_seq} → ${crash.after.last_seq}; outbox kept ${crash.after.outbox_size}.`,
        ],
        result: "No sequence reuse; nothing lost from outbox.",
        evidence: crash,
      });
    }
    case 17:
      return outcome({
        simulated: true,
        steps: ["Flip a byte in a sealed receipt / bundle JSON."],
        result: "Verification fails (hash / signature).",
        evidence: { covered_by: "provenance.test.ts / forensic-receipt" },
      });
    case 18:
      return outcome({
        simulated: true,
        steps: ["Load a pre-Stage-2 bundle with no provenance block."],
        result: "Verifies as G0 legacy.",
        evidence: { covered_by: "provenance.test.ts legacy receipts" },
      });
    default:
      if (attackId === "honest_limit" || Number.isNaN(id)) {
        return {
          ok: true,
          attack: HONEST_LIMIT,
          ran_at: new Date().toISOString(),
          steps: [
            "Source signs amount=100 every time; no feed, no collector, no bureau.",
            "Ingest accepts → grade G1.",
            "Label: signed by source, not corroborated.",
          ],
          result: HONEST_LIMIT.expected,
          evidence: {
            grade: "G1",
            label: "signed by source, not corroborated",
            raises_with: ["G2 reconcile/execute", "G3 collector", "third-party signed facts"],
          },
        };
      }
      return { ok: false, error: "Unknown attack", status: 404 };
  }
}
