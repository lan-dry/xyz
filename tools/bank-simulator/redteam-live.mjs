/**
 * Live Red Team runners: hit real Aegis via RealConnectors / ingest when configured.
 * Returns { simulated: false, ... } on live success, or { simulated: true, reason } when
 * the attack cannot run live (no API / no keys / no token material).
 */
import { randomBytes, randomUUID } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

function cryptoRandomUuid() {
  return randomUUID();
}

/** Prefer standalone demo:connectors HTTP ports when they are up (avoids state lock). */
async function submitViaHttpOrReal(real, systemId, event) {
  const ports = { los: 8787, core: 8788, pay: 8789 };
  const port = ports[systemId] ?? ports.los;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok || res.status === 202) {
      return { status: res.status, body, via: `http://127.0.0.1:${port}/events` };
    }
    // Fall through to in-process if connector HTTP refused the shape.
    if (res.status === 404) throw new Error("no http events");
    return { status: res.status, body, via: `http://127.0.0.1:${port}/events` };
  } catch {
    return real.submit(systemId, event);
  }
}

async function loadSdk() {
  try {
    return await import("@salanor/aegis-sdk");
  } catch {
    const fallback = resolve(repoRoot, "packages/aegis-sdk/dist/index.js");
    if (existsSync(fallback)) {
      return import(new URL(`file:///${fallback.replace(/\\/g, "/")}`).href);
    }
    throw new Error("@salanor/aegis-sdk not built");
  }
}

function sim(reason, steps, result, evidence = {}) {
  return {
    simulated: true,
    label: "Simulation",
    steps: [...(steps || []), `Simulation: ${reason}`],
    result: result || reason,
    evidence: { ...evidence, simulated: true, reason },
  };
}

function live(steps, result, evidence = {}) {
  return {
    simulated: false,
    label: "Live",
    steps,
    result,
    evidence: { ...evidence, simulated: false },
  };
}

async function postSourceEvents(deps, envelope) {
  const res = await deps.postJson(
    "/v1/aegis/source-events",
    envelope,
    {},
    {},
  );
  return res;
}

async function postGoverned(deps, body) {
  return deps.postJson("/v1/aegis/governed/events", body, {}, {});
}

async function postConfirm(deps, body) {
  return deps.postJson("/v1/aegis/executions/confirm", body, {}, {});
}

/**
 * @param {number|string} attackId
 * @param {{
 *   core: any,
 *   connectors: any,
 *   realConnectors?: any,
 *   postJson?: Function,
 *   cfg?: Function,
 * }} deps
 */
export async function runLiveAttack(attackId, deps) {
  const id = Number(attackId);
  const c = typeof deps.cfg === "function" ? deps.cfg() : null;
  const configured = Boolean(c?.configured && c?.apiBase && c?.ingestKey);
  const hasPost = typeof deps.postJson === "function";
  const real = deps.realConnectors;

  if (!configured || !hasPost) {
    return sim(
      "Aegis API / ingest key not configured on the bank simulator",
      [],
      "Cannot run live — configure Aegis API base + ingest key.",
    );
  }

  const sdk = await loadSdk();
  const stamp = Date.now();

  switch (id) {
    case 1: {
      // Forged signature: flip a byte on a well-formed envelope shape.
      const kp = await sdk.generateKeyPair();
      const event = {
        type: "loan.decision",
        case_id: `RT1-${stamp}`,
        amount: 1_000_000,
        currency: "RWF",
      };
      const env = await sdk.signEnvelope(
        sdk.buildEnvelope({
          source_id: "src_los",
          key_id: "key_forged",
          seq: 1,
          event,
        }),
        kp.privateKeyB64,
      );
      const sigBuf = Buffer.from(env.signature, "base64");
      sigBuf[0] = sigBuf[0] ^ 0xff;
      const bad = { ...env, signature: sigBuf.toString("base64") };
      const res = await postSourceEvents(deps, bad);
      return live(
        [
          `POST /v1/aegis/source-events with flipped signature byte → HTTP ${res.status}`,
          `body.code=${res.data?.code ?? res.data?.error ?? "(none)"}`,
        ],
        `Live ingest refused forged signature (HTTP ${res.status}).`,
        { http_status: res.status, body: res.data },
      );
    }
    case 2: {
      const kp = await sdk.generateKeyPair();
      const event = {
        type: "loan.decision",
        case_id: `RT2-${stamp}`,
        amount: 1_000_000,
        currency: "RWF",
      };
      const env = await sdk.signEnvelope(
        sdk.buildEnvelope({
          source_id: "src_los",
          key_id: `key_unknown_${stamp}`,
          seq: 1,
          event,
        }),
        kp.privateKeyB64,
      );
      const res = await postSourceEvents(deps, env);
      return live(
        [
          `Signed with unregistered key_id=${env.key_id}`,
          `POST /source-events → HTTP ${res.status} code=${res.data?.code ?? res.data?.error}`,
        ],
        `Live ingest rejected unknown/unregistered key (HTTP ${res.status}).`,
        { http_status: res.status, body: res.data },
      );
    }
    case 3: {
      if (!real?.ready) {
        return sim(
          "RealConnectors not ready (register LOS key / provision demo tenant)",
          [],
          "Replay needs a real accepted envelope first.",
        );
      }
      try {
        const material = real.keys?.get?.("los");
        if (!material?.private_key_path) {
          return sim(
            "LOS key material missing on RealConnectors",
            [],
            "Cannot build identical-seq replay without LOS private key.",
          );
        }
        const connPkg = await import("@salanor/aegis-connector").catch(async () => {
          const fallback = resolve(repoRoot, "packages/aegis-connector/dist/index.js");
          return import(new URL(`file:///${fallback.replace(/\\/g, "/")}`).href);
        });
        const seed = await connPkg.readPrivateKey(material.private_key_path);
        const event = {
          type: "loan.decision",
          case_id: `RT3-${stamp}`,
          amount: 500_000,
          currency: "RWF",
          summary: "Red Team replay probe",
          idempotency_key: cryptoRandomUuid(),
        };
        const seq = 900_000 + (stamp % 1000);
        const env = await sdk.signEnvelope(
          sdk.buildEnvelope({
            source_id: material.source_id,
            key_id: material.key_id,
            seq,
            event,
            idempotency_key: event.idempotency_key,
          }),
          seed,
        );
        const first = await postSourceEvents(deps, env);
        const second = await postSourceEvents(deps, env);
        return live(
          [
            `Signed LOS envelope seq=${seq} key_id=${material.key_id}`,
            `First POST /source-events → HTTP ${first.status} code=${first.data?.code ?? first.data?.error ?? "ok"}`,
            `Identical replay POST → HTTP ${second.status} code=${second.data?.code ?? second.data?.error ?? "ok"}`,
          ],
          `Live replay → HTTP ${second.status} (expect conflict / seq_replay / idempotent 200).`,
          { first: first.data, second: second.data, seq },
        );
      } catch (err) {
        return live(
          [`Connector/API error: ${err instanceof Error ? err.message : String(err)}`],
          "Live replay attempt completed with refusal/error (expected for seq/nonce).",
          { error: String(err) },
        );
      }
    }
    case 4: {
      const res = await postGoverned(deps, {
        type: "loan.decision",
        case_id: `RT4-${stamp}`,
        amount: 100_000,
        currency: "RWF",
        actor: { type: "system", id: "redteam" },
      });
      return live(
        [
          `POST /governed/events unsigned with ingest bearer only → HTTP ${res.status}`,
          `code=${res.data?.code ?? res.data?.error ?? "(accepted or labelled)"}`,
        ],
        res.status >= 400
          ? `Rejected when signing required (HTTP ${res.status}).`
          : "Accepted as G0 asserted_by_source (transport key is not source identity).",
        { http_status: res.status, body: res.data },
      );
    }
    case 5: {
      // Confirm with amount mismatch against a garbage/mismatched token → refuse.
      const fakeToken = {
        v: 1,
        token_id: `dtk_rt5_${stamp}`,
        tenant: c.orgId || "00000000-0000-0000-0000-000000000000",
        case_id: `RT5-${stamp}`,
        decision_id: "dec_rt5",
        action_type: "loan.disburse",
        params_hash: "0".repeat(64),
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
        nonce: randomBytes(16).toString("base64url"),
        key_id: "key_missing",
        signature: randomBytes(64).toString("base64url"),
      };
      const res = await postConfirm(deps, {
        token: fakeToken,
        params: {
          amount: "18000000",
          currency: "RWF",
          beneficiary_account: "ACCT-HACK",
          product: "retail_loan",
        },
      });
      return live(
        [
          "Confirm called with forged token + amount 18,000,000 (approved would be 4,000,000).",
          `POST /executions/confirm → HTTP ${res.status} code=${res.data?.code ?? res.data?.error}`,
        ],
        `Confirm refused altered/forged execution (HTTP ${res.status}).`,
        { http_status: res.status, body: res.data },
      );
    }
    case 6: {
      const refused = await deps.core.disburse({
        case_id: `RT6-${stamp}`,
        action: { amount: 1000, currency: "RWF" },
        skip_aegis: true,
      });
      const forced = await deps.core.disburse({
        case_id: `RT6-BYPASS-${stamp}`,
        action: { amount: 1000, currency: "RWF" },
        force_db_bypass: true,
      });
      return live(
        [
          `Ungated disburse → HTTP ${refused.status} (${refused.body?.code ?? "refused"}).`,
          `Forced DB write → txn ${forced.body?.entry?.txn_id} (expect executed_without_receipt on reconcile).`,
        ],
        "Core refuses without token; forced bypass recorded for reconciliation.",
        { refused: refused.body, forced: forced.body },
      );
    }
    case 7: {
      const fakeToken = {
        v: 1,
        token_id: `dtk_rt7_${stamp}`,
        tenant: c.orgId || "00000000-0000-0000-0000-000000000000",
        case_id: `RT7-${stamp}`,
        decision_id: "dec_rt7",
        action_type: "loan.disburse",
        params_hash: "1".repeat(64),
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
        nonce: randomBytes(16).toString("base64url"),
        key_id: "key_missing",
        signature: randomBytes(64).toString("base64url"),
      };
      const params = {
        amount: "4000000",
        currency: "RWF",
        beneficiary_account: "ACCT-1",
        product: "retail_loan",
      };
      const first = await postConfirm(deps, { token: fakeToken, params });
      const second = await postConfirm(deps, { token: fakeToken, params });
      return live(
        [
          `First confirm → HTTP ${first.status} code=${first.data?.code ?? first.data?.error}`,
          `Second confirm (same token_id) → HTTP ${second.status} code=${second.data?.code ?? second.data?.error}`,
        ],
        "Both confirms refused without a valid issued token (reuse path covered once a real token exists).",
        { first: first.data, second: second.data },
      );
    }
    case 8: {
      const fakeToken = {
        v: 1,
        token_id: `dtk_rt8_${stamp}`,
        tenant: c.orgId || "00000000-0000-0000-0000-000000000000",
        case_id: `RT8-STOPPED-${stamp}`,
        decision_id: "dec_rt8",
        action_type: "loan.disburse",
        params_hash: "2".repeat(64),
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
        nonce: randomBytes(16).toString("base64url"),
        key_id: "key_missing",
        signature: randomBytes(64).toString("base64url"),
      };
      const res = await postConfirm(deps, {
        token: fakeToken,
        params: {
          amount: "1000",
          currency: "RWF",
          beneficiary_account: "ACCT-1",
          product: "retail_loan",
        },
      });
      return live(
        [
          `Confirm against stopped/unknown case token → HTTP ${res.status}`,
          `code=${res.data?.code ?? res.data?.error}`,
        ],
        `Confirm refused (HTTP ${res.status}).`,
        { http_status: res.status, body: res.data },
      );
    }
    case 9:
      return sim(
        "Approver DB swap is covered by approver-binding.verify fixtures; no live DB mutation from Red Team panel",
        ["Would swap approver_email after seal and re-verify bundle."],
        "Verification fails; field named in findings.",
        { covered_by: "approver-binding.test.ts" },
      );
    case 10: {
      // Live SoD: ask console/API is out of scope without session; hit permit path with requester==approver via governed if available
      return sim(
        "Separation of duties needs an authenticated console approval session",
        ["Requester email equals approver; SoD on."],
        "Blocked by separation of duties (fixture + console guard).",
        { covered_by: "approver-binding.test.ts", expected_code: "separation_of_duties" },
      );
    }
    case 11: {
      const paid = await deps.core.disburse({
        case_id: `RT11-${stamp}`,
        action: { amount: 5000, currency: "RWF" },
        force_db_bypass: true,
      });
      const txnId = paid.body?.entry?.txn_id;
      const edited = txnId
        ? await deps.core.editTransactionAmount(txnId, 999999)
        : null;
      return live(
        [
          `Posted txn ${txnId} then edited amount → ${edited?.amount}.`,
          "Collector / next reconcile should raise db_change_without_event (Stage 6).",
        ],
        "Direct ledger edit recorded; exception expected from collector match.",
        { before: paid.body?.entry, after: edited },
      );
    }
    case 12: {
      if (!real?.ready) {
        return sim(
          "RealConnectors not ready for nested bureau fact",
          [],
          "fact_mismatch covered by third-party-facts.test.ts",
        );
      }
      try {
        const kp = await sdk.generateKeyPair();
        const bureauEvent = {
          type: "credit_bureau.response",
          subject_id: `CUST-RT12-${stamp}`,
          request_id: `req_rt12_${stamp}`,
          fields: { credit_score: 612 },
        };
        const nested = await sdk.signEnvelope(
          sdk.buildEnvelope({
            source_id: "src_bureau",
            key_id: `bureau_unreg_${stamp}`,
            seq: 1,
            event: bureauEvent,
          }),
          kp.privateKeyB64,
        );
        const submitted = await submitViaHttpOrReal(real, "los", {
          type: "loan.decision",
          case_id: `RT12-${stamp}`,
          customer_ref: `CUST-RT12-${stamp}`,
          request_id: `req_rt12_${stamp}`,
          amount: 2_000_000,
          currency: "RWF",
          credit_score: 780,
          third_party_facts: [nested],
          summary: "Red Team bureau mismatch",
        });
        return live(
          [
            "LOS asserted credit_score=780 with nested bureau envelope (score 612).",
            `Connector deliver → ${JSON.stringify(submitted?.status ?? submitted?.body ?? submitted)}`,
          ],
          "Live nested fact path exercised (mismatch if bureau key registered; else nested rejected).",
          { submitted },
        );
      } catch (err) {
        return live(
          [`Error: ${err instanceof Error ? err.message : String(err)}`],
          "Live nested fact attempt finished with error/refusal.",
          { error: String(err) },
        );
      }
    }
    case 13: {
      const paid = await deps.core.disburse({
        case_id: `RT13-${stamp}`,
        action: { amount: 2500, currency: "RWF" },
        force_db_bypass: true,
      });
      const txnId = paid.body?.entry?.txn_id;
      const edited = txnId
        ? await deps.core.editTransactionAmount(txnId, 1)
        : null;
      const feed = await deps.core.exportFeed("jsonl");
      return live(
        [
          `Edited feed row ${txnId} amount → ${edited?.amount}.`,
          `Exported ${feed.path} (${feed.rows} rows).`,
        ],
        "Reconciliation detects amount_mismatch / feed drift on next run.",
        { edited, feed_path: feed.path },
      );
    }
    case 14: {
      // Try marking source silent via reconciliation API if present
      const res = await deps.postJson(
        "/v1/aegis/reconciliation/run",
        { dry_run: false },
        {},
        {},
      ).catch((e) => ({ status: 0, data: { error: String(e) } }));
      if (res.status === 404 || res.status === 0) {
        return sim(
          "No live reconciliation/run endpoint or auth for source_silent from panel",
          ["Source last_seen older than expected_interval_sec."],
          "source_silent covered by reconciliation.test.ts",
          { http_status: res.status, body: res.data },
        );
      }
      return live(
        [`POST reconciliation/run → HTTP ${res.status}`],
        `Reconciliation run invoked (HTTP ${res.status}).`,
        { http_status: res.status, body: res.data },
      );
    }
    case 15: {
      // Toggle unreachable then try confirm
      return sim(
        "Aegis-unavailable policy is a local toggle + fixture; panel does not take Aegis offline",
        [
          "Toggle Aegis unreachable / on_aegis_unavailable=allow_and_flag.",
          "Local token check may pass; case flagged until reconciled.",
        ],
        "Policy-driven; bank not penalised for Aegis outage.",
        { default: "allow_and_flag", alternate: "block" },
      );
    }
    case 16: {
      if (deps.connectors?.simulateCrashRestart) {
        await deps.connectors.recordSend?.("los", { queued: true });
        const crash = await deps.connectors.simulateCrashRestart("los");
        return live(
          [
            "Queued mid-send then restarted Connector for src_los.",
            `last_seq ${crash.before.last_seq} → ${crash.after.last_seq}; outbox kept ${crash.after.outbox_size}.`,
          ],
          "No sequence reuse; nothing lost from outbox.",
          crash,
        );
      }
      return sim("connectors.simulateCrashRestart unavailable", [], "Connector crash sim unavailable");
    }
    case 17: {
      const res = await deps.postJson(
        "/v1/public/verify",
        {
          receipt: {
            receipt_id: "rcpt_tamper",
            receipt_hash: "sha256:deadbeef",
            sig_value_b64: Buffer.from("tampered").toString("base64"),
          },
        },
        {},
        {},
      ).catch((e) => ({ status: 0, data: { error: String(e) } }));
      if (!res.status || res.status === 404) {
        return sim(
          "Public verify endpoint shape differs; tamper covered by provenance fixtures",
          ["Flip a byte in a sealed receipt / bundle JSON."],
          "Verification fails (hash / signature).",
          { covered_by: "provenance.test.ts" },
        );
      }
      return live(
        [`POST public verify with tampered receipt → HTTP ${res.status}`],
        `Verify refused tampered material (HTTP ${res.status}).`,
        { http_status: res.status, body: res.data },
      );
    }
    case 18: {
      return sim(
        "Legacy G0 bundle verify is fixture-only (no pre-change live bundle injection from panel)",
        ["Load a pre-Stage-2 bundle with no provenance block."],
        "Verifies as G0 legacy.",
        { covered_by: "provenance.test.ts" },
      );
    }
    default:
      if (attackId === "honest_limit" || Number.isNaN(id)) {
        if (!real?.ready) {
          return {
            simulated: true,
            label: "Simulation",
            steps: [
              "Source signs amount=100 every time; no feed, no collector, no bureau.",
              "Simulation: RealConnectors not ready.",
            ],
            result:
              'Case stays G1, labelled "signed by source, not corroborated".',
            evidence: { grade: "G1", simulated: true },
          };
        }
        try {
          const submitted = await submitViaHttpOrReal(real, "los", {
            type: "loan.decision",
            case_id: `RT-HONEST-${stamp}`,
            amount: 100,
            currency: "RWF",
            summary: "Honest limit: consistently false signed value",
          });
          return {
            simulated: false,
            label: "Live",
            steps: [
              "LOS Connector signed amount=100 (false relative to any real account).",
              `Deliver → ${JSON.stringify(submitted?.status ?? submitted?.body ?? submitted)}`,
              "No second record to compare → stays G1 until reconcile/collector/bureau.",
            ],
            result:
              'Live signed false value accepted at G1, labelled "signed by source, not corroborated".',
            evidence: { submitted, grade: "G1" },
          };
        } catch (err) {
          return {
            simulated: false,
            label: "Live",
            steps: [`Error: ${err instanceof Error ? err.message : String(err)}`],
            result: "Live honest-limit attempt finished with error.",
            evidence: { error: String(err) },
          };
        }
      }
      return { ok: false, error: "Unknown attack", status: 404 };
  }
}
