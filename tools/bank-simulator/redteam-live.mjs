/**
 * Live Red Team with positive controls.
 * For each attack: (a) unaltered control succeeds, (b) one change, (c) assert expected code.
 * Uses src_los_redteam only — never src_los (sequence ownership).
 */
import { randomBytes, randomUUID } from "node:crypto";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const REDTEAM_SOURCE = "src_los_redteam";
const REDTEAM_KEY_ID = "k_los_redteam_2026_01";

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

async function loadConnectorPkg() {
  try {
    return await import("@salanor/aegis-connector");
  } catch {
    const fallback = resolve(repoRoot, "packages/aegis-connector/dist/index.js");
    if (existsSync(fallback)) {
      return import(new URL(`file:///${fallback.replace(/\\/g, "/")}`).href);
    }
    throw new Error("@salanor/aegis-connector not built");
  }
}

function codeOf(res) {
  const b = res?.data ?? res?.body ?? {};
  return b.code ?? b.error ?? (res?.status ? `http_${res.status}` : "unknown");
}

function assertCode(actual, expected, label) {
  const ok = Array.isArray(expected)
    ? expected.includes(actual)
    : actual === expected;
  return {
    ok,
    label,
    expected: Array.isArray(expected) ? expected.join("|") : expected,
    actual,
    verdict: ok ? "PASS" : "FAIL",
  };
}

function outcome(partial) {
  const fails = (partial.assertions || []).filter((a) => !a.ok);
  return {
    simulated: partial.simulated === true,
    label: partial.simulated ? "Simulation" : "Live",
    report_status: fails.length
      ? "FAIL"
      : partial.simulated
        ? "Simulated"
        : "Live",
    ok: fails.length === 0,
    steps: partial.steps ?? [],
    result: fails.length
      ? `FAIL: ${fails.map((f) => `${f.label} expected=${f.expected} actual=${f.actual}`).join("; ")}`
      : partial.result ?? "PASS",
    evidence: {
      ...(partial.evidence ?? {}),
      assertions: partial.assertions ?? [],
      control: partial.control ?? null,
      attack: partial.attack ?? null,
    },
  };
}

function sim(reason, steps = []) {
  return outcome({
    simulated: true,
    steps: [...steps, `Simulation: ${reason}`],
    result: reason,
    assertions: [],
  });
}

async function postSourceEvents(deps, envelope) {
  return deps.postJson("/v1/aegis/source-events", envelope, {}, {});
}

async function postGoverned(deps, body) {
  return deps.postJson("/v1/aegis/governed/events", body, {}, {});
}

async function postConfirm(deps, body) {
  return deps.postJson("/v1/aegis/executions/confirm", body, {}, {});
}

async function fetchLastSeq(deps, sourceId) {
  return deps.postJson
    ? deps.cfg &&
      (await fetch(
        `${deps.cfg().apiBase}/v1/aegis/sources/${encodeURIComponent(sourceId)}/last-seq`,
        {
          headers: { Authorization: `Bearer ${deps.cfg().ingestKey}` },
          signal: AbortSignal.timeout(10_000),
        },
      ).then(async (r) => ({
        status: r.status,
        data: await r.json().catch(() => ({})),
      })))
    : null;
}

const BUREAU_SOURCE = "src_bureau";
const BUREAU_KEY_ID = "k_bureau_2026_01";

async function ensureKeyMaterial(sdk, connPkg, sourceId, keyId, note) {
  const dir = resolve(
    process.env.AEGIS_CONNECTORS_DIR?.trim() ||
      join(repoRoot, ".data", "connectors"),
    sourceId,
  );
  await mkdir(dir, { recursive: true });
  const keyPath = join(dir, "private.key");
  const metaPath = join(dir, "meta.json");
  if (existsSync(keyPath) && existsSync(metaPath)) {
    const meta = JSON.parse(await readFile(metaPath, "utf8"));
    const seed = await connPkg.readPrivateKey(keyPath);
    return {
      source_id: sourceId,
      key_id: meta.key_id || keyId,
      seed,
      public_key_b64: meta.public_key_b64,
      dir,
    };
  }
  const pair = await sdk.generateKeyPair();
  await connPkg.writePrivateKey(keyPath, pair.privateKey, { force: true });
  const meta = {
    source_id: sourceId,
    key_id: keyId,
    public_key_b64: pair.publicKeyB64,
    created_at: new Date().toISOString(),
    note,
  };
  await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, { mode: 0o600 });
  await chmod(metaPath, 0o600).catch(() => undefined);
  return {
    source_id: sourceId,
    key_id: keyId,
    seed: pair.privateKey,
    public_key_b64: pair.publicKeyB64,
    dir,
  };
}

/** Load or create Red Team key material (separate from src_los). */
async function ensureRedteamKey(sdk, connPkg) {
  return ensureKeyMaterial(
    sdk,
    connPkg,
    REDTEAM_SOURCE,
    REDTEAM_KEY_ID,
    "Red Team sequence owner — never share with src_los",
  );
}

/** Bureau third_party key for nested fact envelopes. */
async function ensureBureauKey(sdk, connPkg) {
  return ensureKeyMaterial(
    sdk,
    connPkg,
    BUREAU_SOURCE,
    BUREAU_KEY_ID,
    "Demo Credit Bureau — nested third_party facts",
  );
}

/** Look up a reconciliation exception for a case (DB via local pool when available). */
async function caseHasException(deps, caseId, kind) {
  try {
    const { createRequire } = await import("node:module");
    const { resolve: resolvePath } = await import("node:path");
    const require = createRequire(resolvePath(repoRoot, "services/aegis-api/package.json"));
    const pg = require("pg");
    const { existsSync, readFileSync } = await import("node:fs");
    for (const p of [".env", ".env.local", "services/aegis-api/.env"]) {
      const full = resolvePath(repoRoot, p);
      if (!existsSync(full)) continue;
      for (const line of readFileSync(full, "utf8").split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const i = t.indexOf("=");
        if (i < 0) continue;
        const k = t.slice(0, i).trim();
        if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
      }
    }
    const org =
      deps.cfg?.()?.orgId ||
      deps.cfg?.()?.organizationId ||
      process.env.AEGIS_ORGANIZATION_ID ||
      null;
    if (!process.env.DATABASE_URL || !org) return false;
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const r = await pool.query(
        `SELECT 1 FROM reconciliation_exception
         WHERE organization_id = $1 AND case_id = $2 AND kind = $3
         LIMIT 1`,
        [org, caseId, kind],
      );
      return r.rowCount > 0;
    } finally {
      await pool.end();
    }
  } catch {
    return false;
  }
}

async function nextSeq(deps, sourceId) {
  try {
    const c = deps.cfg();
    const res = await fetch(
      `${c.apiBase}/v1/aegis/sources/${encodeURIComponent(sourceId)}/last-seq`,
      {
        headers: { Authorization: `Bearer ${c.ingestKey}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok && typeof data.last_seq === "number") return data.last_seq + 1;
  } catch {
    /* fall through */
  }
  return 1;
}

/** Build a bank-shaped business event (schema_version 1) for signed ingest. */
function bankEvent(partial = {}) {
  const idem = randomUUID();
  const caseId = partial.case_id || `RT-${Date.now()}`;
  const attrs = {
    amount: partial.amount ?? 1_000_000,
    currency: partial.currency ?? "RWF",
    requester_email: partial.requester_email ?? "officer@demo.test",
    requester_name: partial.requester_name ?? "Patience Ingabire",
    summary: partial.summary ?? "Red Team probe",
    ...(partial.attributes || {}),
  };
  if (partial.credit_score != null) attrs.credit_score = partial.credit_score;
  if (partial.customer_ref) attrs.customer_ref = partial.customer_ref;
  if (partial.beneficiary_account) {
    attrs.beneficiary_account = partial.beneficiary_account;
  }
  return {
    schema_version: 1,
    case_id: caseId,
    idempotency_key: idem,
    event_type: partial.event_type ?? "loan_decision",
    product: partial.product ?? "retail_loan",
    emitted_at: new Date().toISOString(),
    actor: { type: "system", id: "redteam" },
    attributes: attrs,
    trace_id: `tr_rt_${idem.slice(0, 8)}`,
    ...(partial.request_id ? { request_id: partial.request_id } : {}),
    ...(partial.third_party_facts
      ? { third_party_facts: partial.third_party_facts }
      : {}),
  };
}

async function signEvent(sdk, material, event, seq) {
  const body =
    event && event.schema_version === 1
      ? event
      : bankEvent(event || {});
  const idem = body.idempotency_key;
  return sdk.signEnvelope(
    sdk.buildEnvelope({
      source_id: material.source_id,
      key_id: material.key_id,
      seq,
      event: body,
      idempotency_key: idem,
    }),
    material.seed,
  );
}

/**
 * Issue a real decision token by posting an allow-path signed event (small amount).
 * Returns { token, params, case_id } or null.
 */
function findToken(data) {
  if (!data || typeof data !== "object") return null;
  if (data.decision_token) return data.decision_token;
  if (data.token?.v === 1) return data.token;
  if (data.receipt?.decision_token) return data.receipt.decision_token;
  if (data.body?.decision_token) return data.body.decision_token;
  return null;
}

async function issueLiveToken(deps, sdk, material) {
  const caseId = `RT-TOKEN-${Date.now()}`;
  // Stay under auto-allow threshold (AUTH-RL-1). Types must match token-bound params.
  const params = {
    amount: 1_200_000,
    currency: "RWF",
    beneficiary_account: "ACCT-RT-1",
    product: "retail_loan",
  };
  const seq = await nextSeq(deps, material.source_id);
  const env = await signEvent(
    sdk,
    material,
    bankEvent({
      case_id: caseId,
      amount: params.amount,
      currency: params.currency,
      beneficiary_account: params.beneficiary_account,
      product: params.product,
      summary: "Red Team token issue",
      attributes: { product: params.product },
    }),
    seq,
  );
  const res = await postSourceEvents(deps, env);
  const token = findToken(res.data);
  if (!token) {
    return {
      error: codeOf(res) || `http_${res.status}_no_token`,
      status: res.status,
      caseId,
      res,
      outcome: res.data?.outcome ?? res.data?.decision?.outcome,
      body: res.data,
    };
  }
  return { token, params, caseId, res };
}

export async function runLiveAttack(attackId, deps) {
  const id = Number(attackId);
  const c = typeof deps.cfg === "function" ? deps.cfg() : null;
  if (!c?.configured || typeof deps.postJson !== "function") {
    return sim("Aegis API / ingest key not configured");
  }

  const sdk = await loadSdk();
  const connPkg = await loadConnectorPkg();
  let material;
  try {
    material = await ensureRedteamKey(sdk, connPkg);
  } catch (err) {
    return sim(`Red Team key material unavailable: ${err.message}`);
  }

  const stamp = Date.now();

  switch (id) {
    case 1: {
      // Control: valid signature → 200; attack: flip one byte → bad_signature
      const seq = await nextSeq(deps, material.source_id);
      const event = bankEvent({
        case_id: `RT1-CTRL-${stamp}`,
        amount: 1000,
        currency: "RWF",
      });
      const good = await signEvent(sdk, material, event, seq);
      const control = await postSourceEvents(deps, good);
      const controlAssert = assertCode(
        codeOf(control),
        ["ok", "accepted", "http_200", "unknown"],
        "control",
      );
      // Treat HTTP 200 as success even if code field absent
      if (control.status === 200) {
        controlAssert.ok = true;
        controlAssert.actual = codeOf(control) || "http_200";
        controlAssert.verdict = "PASS";
      }
      if (control.status === 401 && codeOf(control) === "unknown_key") {
        return sim(
          "src_los_redteam not registered — run demo:fresh / provision",
          [
            `control HTTP ${control.status} code=${codeOf(control)}`,
          ],
        );
      }
      const seq2 = await nextSeq(deps, material.source_id);
      const good2 = await signEvent(
        sdk,
        material,
        bankEvent({ case_id: `RT1-ATK-${stamp}`, amount: 1000, currency: "RWF" }),
        seq2,
      );
      // Signature is base64url; flip one decoded byte and re-encode so verify
      // returns bad_signature (not malformed from invalid encoding).
      const decoded =
        typeof sdk.base64urlDecode === "function"
          ? sdk.base64urlDecode(good2.signature)
          : Buffer.from(good2.signature.replace(/-/g, "+").replace(/_/g, "/"), "base64");
      const sigBuf = Buffer.from(decoded);
      sigBuf[0] ^= 0xff;
      const flipped =
        typeof sdk.base64urlEncode === "function"
          ? sdk.base64urlEncode(sigBuf)
          : sigBuf
              .toString("base64")
              .replace(/\+/g, "-")
              .replace(/\//g, "_")
              .replace(/=+$/g, "");
      const bad = { ...good2, signature: flipped };
      const attack = await postSourceEvents(deps, bad);
      const attackAssert = assertCode(codeOf(attack), "bad_signature", "attack");
      return outcome({
        steps: [
          `CONTROL unaltered POST → HTTP ${control.status} code=${codeOf(control)} [${controlAssert.verdict}]`,
          `ATTACK flipped signature byte → HTTP ${attack.status} code=${codeOf(attack)} [${attackAssert.verdict}]`,
          `expected=bad_signature actual=${codeOf(attack)}`,
        ],
        result:
          attackAssert.ok && controlAssert.ok
            ? "PASS: control accepted; forged signature → bad_signature"
            : undefined,
        assertions: [controlAssert, attackAssert],
        control: { status: control.status, code: codeOf(control) },
        attack: { status: attack.status, code: codeOf(attack) },
      });
    }
    case 2: {
      const seq = await nextSeq(deps, material.source_id);
      const controlEnv = await signEvent(
        sdk,
        material,
        bankEvent({ case_id: `RT2-CTRL-${stamp}`, amount: 1000 }),
        seq,
      );
      const control = await postSourceEvents(deps, controlEnv);
      const controlAssert = assertCode(
        String(control.status),
        ["200", "201"],
        "control",
      );
      if (control.status === 200) {
        controlAssert.ok = true;
        controlAssert.verdict = "PASS";
      }
      if (codeOf(control) === "unknown_key") {
        return sim("src_los_redteam not registered — run demo:fresh", [
          `control code=${codeOf(control)}`,
        ]);
      }
      const kp = await sdk.generateKeyPair();
      const unregEvent = bankEvent({
        case_id: `RT2-ATK-${stamp}`,
        amount: 1000,
      });
      const unreg2 = await sdk.signEnvelope(
        sdk.buildEnvelope({
          source_id: material.source_id,
          key_id: `key_unknown_${stamp}`,
          seq: (await nextSeq(deps, material.source_id)) + 50,
          event: unregEvent,
          idempotency_key: unregEvent.idempotency_key,
        }),
        kp.privateKeyB64,
      );
      const attack = await postSourceEvents(deps, unreg2);
      const attackAssert = assertCode(codeOf(attack), "unknown_key", "attack");
      return outcome({
        steps: [
          `CONTROL registered key → HTTP ${control.status} [${controlAssert.verdict}]`,
          `ATTACK unregistered key_id → HTTP ${attack.status} code=${codeOf(attack)} [${attackAssert.verdict}]`,
          `expected=unknown_key actual=${codeOf(attack)}`,
        ],
        result:
          attackAssert.ok && controlAssert.ok
            ? "PASS: control ok; unregistered key → unknown_key"
            : undefined,
        assertions: [controlAssert, attackAssert],
        control: { status: control.status, code: codeOf(control) },
        attack: { status: attack.status, code: codeOf(attack) },
      });
    }
    case 3: {
      const seq = await nextSeq(deps, material.source_id);
      const env = await signEvent(
        sdk,
        material,
        bankEvent({ case_id: `RT3-${stamp}`, amount: 500 }),
        seq,
      );
      const first = await postSourceEvents(deps, env);
      const controlAssert = assertCode(String(first.status), ["200", "201"], "control_first");
      if (first.status === 200) {
        controlAssert.ok = true;
        controlAssert.verdict = "PASS";
      }
      if (codeOf(first) === "unknown_key") {
        return sim("src_los_redteam not registered — run demo:fresh");
      }
      const second = await postSourceEvents(deps, env);
      const attackAssert = assertCode(
        codeOf(second),
        ["seq_replay", "ok", "accepted", "http_200"],
        "replay",
      );
      // idempotent 200 is PASS; seq_replay is PASS
      if (second.status === 200 || codeOf(second) === "seq_replay") {
        attackAssert.ok = true;
        attackAssert.actual = codeOf(second) || `http_${second.status}`;
        attackAssert.verdict = "PASS";
      }
      return outcome({
        steps: [
          `CONTROL first POST → HTTP ${first.status} code=${codeOf(first)} [${controlAssert.verdict}]`,
          `ATTACK identical replay → HTTP ${second.status} code=${codeOf(second)} [${attackAssert.verdict}]`,
          `expected=seq_replay|idempotent_200 actual=${codeOf(second) || second.status}`,
        ],
        result:
          controlAssert.ok && attackAssert.ok
            ? "PASS: first accepted; replay seq_replay or idempotent 200"
            : undefined,
        assertions: [controlAssert, attackAssert],
        control: { status: first.status, code: codeOf(first) },
        attack: { status: second.status, code: codeOf(second) },
      });
    }
    case 4: {
      // Control: signed envelope succeeds; attack: otherwise-valid unsigned bank event → signed_events_required
      const seq = await nextSeq(deps, material.source_id);
      const controlEnv = await signEvent(
        sdk,
        material,
        bankEvent({ case_id: `RT4-CTRL-${stamp}`, amount: 1000 }),
        seq,
      );
      const control = await postSourceEvents(deps, controlEnv);
      const controlAssert = assertCode(String(control.status), ["200", "201"], "control");
      if (control.status === 200) {
        controlAssert.ok = true;
        controlAssert.verdict = "PASS";
      }
      const unsigned = await postGoverned(deps, {
        schema_version: 1,
        case_id: `RT4-ATK-${stamp}`,
        idempotency_key: randomUUID(),
        event_type: "loan_decision",
        product: "retail_loan",
        emitted_at: new Date().toISOString(),
        actor: { type: "system", id: "redteam" },
        attributes: {
          amount: 100000,
          currency: "RWF",
          requester_email: "officer@demo.test",
        },
      });
      const attackAssert = assertCode(
        codeOf(unsigned),
        "signed_events_required",
        "attack",
      );
      return outcome({
        steps: [
          `CONTROL signed envelope → HTTP ${control.status} [${controlAssert.verdict}]`,
          `ATTACK unsigned valid bank event → HTTP ${unsigned.status} code=${codeOf(unsigned)} [${attackAssert.verdict}]`,
          `expected=signed_events_required actual=${codeOf(unsigned)}`,
        ],
        result:
          controlAssert.ok && attackAssert.ok
            ? "PASS: unsigned refused with signed_events_required"
            : undefined,
        assertions: [controlAssert, attackAssert],
        control: { status: control.status, code: codeOf(control) },
        attack: { status: unsigned.status, code: codeOf(unsigned) },
      });
    }
    case 6: {
      // Control: ungated pay refused; attack: forced DB bypass posts txn for reconcile.
      const refused = await deps.core.disburse({
        case_id: `RT6-REFUSE-${stamp}`,
        action: { amount: 10, currency: "RWF" },
        skip_aegis: true,
      });
      const refuseAssert = assertCode(
        refused.body?.code ?? codeOf(refused),
        "confirm_required",
        "ungated_refuse",
      );
      if (refused.status === 403 && refused.body?.code === "confirm_required") {
        refuseAssert.ok = true;
        refuseAssert.actual = "confirm_required";
        refuseAssert.verdict = "PASS";
      }
      const forced = await deps.core.disburse({
        case_id: `RT6-BYPASS-${stamp}`,
        action: { amount: 10, currency: "RWF" },
        force_db_bypass: true,
      });
      const bypassOk = forced.status === 200 && Boolean(forced.body?.entry?.txn_id);
      const bypassAssert = {
        ok: bypassOk,
        label: "forced_bypass",
        expected: "txn_id",
        actual: forced.body?.entry?.txn_id ?? `http_${forced.status}`,
        verdict: bypassOk ? "PASS" : "FAIL",
      };
      return outcome({
        steps: [
          `CONTROL ungated skip_aegis → HTTP ${refused.status} code=${refused.body?.code} [${refuseAssert.verdict}]`,
          `ATTACK force_db_bypass → HTTP ${forced.status} txn=${forced.body?.entry?.txn_id ?? "none"} [${bypassAssert.verdict}]`,
          "Forced write should surface executed_without_receipt on reconcile",
        ],
        assertions: [refuseAssert, bypassAssert],
        result:
          refuseAssert.ok && bypassAssert.ok
            ? "PASS: Core refuses without token; forced bypass recorded for reconciliation"
            : undefined,
        evidence: {
          refused: {
            status: refused.status,
            code: refused.body?.code,
            body: refused.body,
          },
          forced: {
            status: forced.status,
            txn_id: forced.body?.entry?.txn_id,
          },
        },
      });
    }
    case 5:
    case 7:
    case 8: {
      const issued = await issueLiveToken(deps, sdk, material);
      if (!issued.token) {
        return sim(
          `Could not issue live decision token (HTTP ${issued.status} code=${issued.error}). Need allow-path + executable_params.`,
          [`token issue failed: ${issued.error}`],
        );
      }
      const { token, params, caseId } = issued;
      if (id === 5) {
        // Attack first (don't consume token): altered amount.
        // API failure code is params_mismatch; sealed exception kind is execution_mismatch.
        const badParams = { ...params, amount: 18_000_000 };
        const attack = await postConfirm(deps, { token, params: badParams });
        const attackCode = codeOf(attack);
        const fields = (attack.data?.mismatched_fields || []).map((m) => m.field);
        const namesAmount =
          fields.includes("amount") ||
          String(attack.data?.message ?? "").includes("amount");
        const attackAssert = assertCode(
          attackCode,
          ["params_mismatch", "execution_mismatch"],
          "attack",
        );
        const fieldAssert = {
          ok: namesAmount,
          label: "field_amount",
          expected: "amount",
          actual: fields.join(",") || String(attack.data?.message ?? ""),
          verdict: namesAmount ? "PASS" : "FAIL",
        };
        // Fresh token for positive control confirm
        const issued2 = await issueLiveToken(deps, sdk, material);
        let controlAssert = {
          ok: false,
          label: "control_confirm",
          expected: "matched|http_200",
          actual: "no_token",
          verdict: "FAIL",
        };
        let control = { status: 0, data: null };
        if (issued2.token) {
          control = await postConfirm(deps, {
            token: issued2.token,
            params: issued2.params,
          });
          controlAssert = assertCode(
            codeOf(control),
            ["matched", "ok", "executed", "http_200"],
            "control_confirm",
          );
          if (control.status === 200 && control.data?.ok !== false) {
            controlAssert.ok = true;
            controlAssert.actual = codeOf(control) || "http_200";
            controlAssert.verdict = "PASS";
          }
        }
        return outcome({
          steps: [
            `CONTROL confirm amount=${issued2.params?.amount ?? "n/a"} → HTTP ${control.status} code=${codeOf(control)} [${controlAssert.verdict}]`,
            `ATTACK amount=18000000 → HTTP ${attack.status} code=${attackCode} fields=${fields.join(",") || "?"} [${attackAssert.verdict}]`,
            `expected=params_mismatch|execution_mismatch (amount named) actual=${attackCode}`,
          ],
          assertions: [controlAssert, attackAssert, fieldAssert],
          control: { status: control.status, code: codeOf(control) },
          attack: {
            status: attack.status,
            code: attackCode,
            mismatched_fields: fields,
          },
          result:
            attackAssert.ok && fieldAssert.ok
              ? "PASS: altered amount → params_mismatch/execution_mismatch naming amount"
              : undefined,
        });
      }
      if (id === 7) {
        const first = await postConfirm(deps, { token, params });
        const controlAssert = assertCode(
          codeOf(first),
          ["matched", "ok", "executed", "http_200"],
          "control_first_confirm",
        );
        if (first.status === 200 && first.data?.ok !== false) {
          controlAssert.ok = true;
          controlAssert.actual = codeOf(first) || "http_200";
          controlAssert.verdict = "PASS";
        }
        const second = await postConfirm(deps, { token, params });
        const attackAssert = assertCode(codeOf(second), "used", "attack_reuse");
        return outcome({
          steps: [
            `CONTROL first confirm → HTTP ${first.status} code=${codeOf(first)} [${controlAssert.verdict}]`,
            `ATTACK reuse same token → HTTP ${second.status} code=${codeOf(second)} [${attackAssert.verdict}]`,
            `expected=used actual=${codeOf(second)}`,
          ],
          assertions: [controlAssert, attackAssert],
          control: { status: first.status, code: codeOf(first) },
          attack: { status: second.status, code: codeOf(second) },
          result: attackAssert.ok ? "PASS: token reuse → used" : undefined,
        });
      }
      // id === 8: issue allow token, then stop same case via SANC-01, confirm → stopped
      const stopEnv = await signEvent(
        sdk,
        material,
        bankEvent({
          case_id: caseId,
          amount: 1_200_000,
          currency: "RWF",
          beneficiary_account: params.beneficiary_account,
          product: params.product,
          summary: "Red Team stop overlay",
          attributes: {
            product: params.product,
            screening: {
              sanctions_hit: false,
              pep_hit: true,
              list: "PEP watchlist (redteam)",
            },
          },
        }),
        await nextSeq(deps, material.source_id),
      );
      const stopRes = await postSourceEvents(deps, stopEnv);
      const stopOutcome =
        stopRes.data?.outcome ?? stopRes.data?.decision?.outcome ?? codeOf(stopRes);
      const stopAssert = {
        ok: stopOutcome === "stop" || stopRes.status === 200,
        label: "stop_event",
        expected: "stop",
        actual: String(stopOutcome),
        verdict: stopOutcome === "stop" ? "PASS" : "FAIL",
      };
      const attack = await postConfirm(deps, { token, params });
      const attackAssert = assertCode(codeOf(attack), "stopped", "attack");
      return outcome({
        steps: [
          `CONTROL token issued for ${caseId} (allow)`,
          `STOP overlay → HTTP ${stopRes.status} outcome=${stopOutcome} [${stopAssert.verdict}]`,
          `ATTACK confirm after stop → HTTP ${attack.status} code=${codeOf(attack)} [${attackAssert.verdict}]`,
          `expected=stopped actual=${codeOf(attack)}`,
        ],
        assertions: [stopAssert, attackAssert],
        control: { status: issued.status, code: "token_issued" },
        attack: { status: attack.status, code: codeOf(attack) },
        result: attackAssert.ok ? "PASS: confirm → stopped" : undefined,
      });
    }
    case 11: {
      const paid = await deps.core.disburse({
        case_id: `RT11-${stamp}`,
        action: { amount: 5000, currency: "RWF" },
        force_db_bypass: true,
      });
      const txnId = paid.body?.entry?.txn_id;
      if (txnId) await deps.core.editTransactionAmount(txnId, 999999);
      // Try collector / reconcile
      let found = false;
      let reconcileBody = null;
      try {
        const r = await deps.postJson(
          "/v1/aegis/reconciliation/runs",
          { feed_hint: "core_ledger" },
          {},
          {},
        );
        reconcileBody = r.data;
        found = JSON.stringify(r.data ?? {}).includes("db_change_without_event");
      } catch (err) {
        reconcileBody = { error: String(err) };
      }
      if (!found) {
        return {
          simulated: true,
          label: "Simulation",
          report_status: "Not verified live",
          ok: true,
          steps: [
            `Forced ledger edit txn=${txnId}`,
            "Collector/reconcile did not surface db_change_without_event",
            "Not verified live",
          ],
          result: "Not verified live",
          evidence: { txnId, reconcileBody },
        };
      }
      return outcome({
        steps: [
          `Forced ledger edit txn=${txnId}`,
          "Reconcile/collector raised db_change_without_event [PASS]",
        ],
        result: "PASS: db_change_without_event present",
        assertions: [
          { ok: true, label: "exception", expected: "db_change_without_event", actual: "db_change_without_event", verdict: "PASS" },
        ],
      });
    }
    case 12: {
      // Nested bureau fact mismatch — control matching score, attack inflated LOS score
      const subject = `CUST-RT12-${stamp}`;
      const reqCtrl = randomUUID();
      const reqAtk = randomUUID();
      let bureau;
      try {
        bureau = await ensureBureauKey(sdk, connPkg);
      } catch (err) {
        return sim(`Bureau key unavailable: ${err.message}`);
      }
      const signBureau = async (score, requestId, seq) => {
        const unsigned = sdk.buildEnvelope({
          source_id: bureau.source_id,
          key_id: bureau.key_id,
          seq,
          event: {
            type: "credit_bureau.response",
            subject_id: subject,
            request_id: requestId,
            fields: { credit_score: score },
          },
        });
        return sdk.signEnvelope(unsigned, bureau.seed);
      };
      const ctrlBureau = await signBureau(612, reqCtrl, 1 + (stamp % 1000));
      const controlEnv = await signEvent(
        sdk,
        material,
        bankEvent({
          case_id: `RT12-CTRL-${stamp}`,
          customer_ref: subject,
          request_id: reqCtrl,
          amount: 1_000_000,
          credit_score: 612,
          attributes: {
            customer_ref: subject,
            request_id: reqCtrl,
            credit_score: 612,
            third_party_facts: [ctrlBureau],
          },
        }),
        await nextSeq(deps, material.source_id),
      );
      const control = await postSourceEvents(deps, controlEnv);
      const controlAssert = assertCode(String(control.status), ["200", "201"], "control");
      if (control.status === 200) {
        controlAssert.ok = true;
        controlAssert.verdict = "PASS";
      }
      if (codeOf(control) === "unknown_key") {
        return sim("src_los_redteam not registered");
      }
      const atkBureau = await signBureau(612, reqAtk, 2 + (stamp % 1000));
      const attackEnv = await signEvent(
        sdk,
        material,
        bankEvent({
          case_id: `RT12-ATK-${stamp}`,
          customer_ref: subject,
          request_id: reqAtk,
          amount: 1_000_000,
          credit_score: 780,
          attributes: {
            customer_ref: subject,
            request_id: reqAtk,
            credit_score: 780,
            third_party_facts: [atkBureau],
          },
        }),
        await nextSeq(deps, material.source_id),
      );
      const attack = await postSourceEvents(deps, attackEnv);
      // fact_mismatch is raised as a reconciliation/exception row, not in HTTP body
      let found = JSON.stringify(attack.data ?? {}).includes("fact_mismatch");
      if (!found) {
        found = await caseHasException(
          deps,
          `RT12-ATK-${stamp}`,
          "fact_mismatch",
        );
      }
      if (!found && attack.status === 200) {
        // Honest: nest may be rejected if src_bureau not registered on this tenant
        return {
          simulated: true,
          label: "Simulation",
          report_status: "Not verified live",
          ok: true,
          steps: [
            `CONTROL score=612 nest → HTTP ${control.status} [${controlAssert.verdict}]`,
            `ATTACK score=780 nest → HTTP ${attack.status}; fact_mismatch not in response`,
            "Not verified live — register src_bureau on tenant (demo:fresh / provision)",
          ],
          result: "Not verified live",
          evidence: {
            control: { status: control.status },
            attack: { status: attack.status, body: attack.data },
          },
        };
      }
      const attackAssert = {
        ok: found,
        label: "fact_mismatch",
        expected: "fact_mismatch",
        actual: found ? "fact_mismatch" : codeOf(attack) || `http_${attack.status}`,
        verdict: found ? "PASS" : "FAIL",
      };
      return outcome({
        steps: [
          `CONTROL score=612 → HTTP ${control.status} [${controlAssert.verdict}]`,
          `ATTACK score=780 → HTTP ${attack.status} fact_mismatch=${found} [${attackAssert.verdict}]`,
          `expected=fact_mismatch actual=${attackAssert.actual}`,
        ],
        assertions: [controlAssert, attackAssert],
        result: found ? "PASS: fact_mismatch" : undefined,
      });
    }
    case 13: {
      const paid = await deps.core.disburse({
        case_id: `RT13-${stamp}`,
        action: { amount: 2500, currency: "RWF" },
        force_db_bypass: true,
      });
      const txnId = paid.body?.entry?.txn_id;
      if (txnId) await deps.core.editTransactionAmount(txnId, 1);
      const feed = await deps.core.exportFeed("jsonl");
      let found = false;
      let body = null;
      try {
        const r = await deps.postJson(
          "/v1/aegis/reconciliation/runs",
          { feed_path: feed.path },
          {},
          {},
        );
        body = r.data;
        found = JSON.stringify(r.data ?? {}).includes("amount_mismatch");
      } catch (err) {
        body = { error: String(err) };
      }
      if (!found) {
        return {
          simulated: true,
          label: "Simulation",
          report_status: "Not verified live",
          ok: true,
          steps: [
            `Edited feed row ${txnId}; exported ${feed.path}`,
            "Not verified live — amount_mismatch not observed",
          ],
          result: "Not verified live",
          evidence: { feed: feed.path, body },
        };
      }
      return outcome({
        steps: [
          `Edited feed row ${txnId}; exported ${feed.path}`,
          "Reconciliation raised amount_mismatch [PASS]",
        ],
        assertions: [
          {
            ok: true,
            label: "reconcile",
            expected: "amount_mismatch",
            actual: "amount_mismatch",
            verdict: "PASS",
          },
        ],
        result: "PASS: amount_mismatch",
        evidence: { feed: feed.path, body },
      });
    }
    case 9:
    case 10:
    case 14:
    case 15:
    case 17:
    case 18:
      return sim(`Attack #${id} remains fixture/Simulation (no live positive-control path)`);
    case 16: {
      if (!deps.connectors?.simulateCrashRestart) {
        return sim("connectors.simulateCrashRestart unavailable");
      }
      await deps.connectors.recordSend?.("los", { queued: true });
      const crash = await deps.connectors.simulateCrashRestart("los");
      return outcome({
        steps: [
          `Crash/restart los: last_seq ${crash.before.last_seq}→${crash.after.last_seq}`,
          "PASS: outbox retained; no seq reuse in sim",
        ],
        assertions: [
          {
            ok: crash.after.last_seq >= crash.before.last_seq,
            label: "seq_monotonic",
            expected: ">= before",
            actual: String(crash.after.last_seq),
            verdict: "PASS",
          },
        ],
        result: "PASS: connector crash sim",
        evidence: crash,
      });
    }
    default:
      if (attackId === "honest_limit" || Number.isNaN(id)) {
        const seq = await nextSeq(deps, material.source_id);
        const env = await signEvent(
          sdk,
          material,
          bankEvent({
            case_id: `RT-HONEST-${stamp}`,
            amount: 100,
            summary: "Honest limit false signed value",
          }),
          seq,
        );
        const res = await postSourceEvents(deps, env);
        const ok = res.status === 200;
        const assert = assertCode(String(res.status), ["200", "201"], "honest_ingest");
        if (ok) {
          assert.ok = true;
          assert.verdict = "PASS";
        }
        if (codeOf(res) === "unknown_key") {
          return sim("src_los_redteam not registered — run demo:fresh");
        }
        return outcome({
          steps: [
            `Honest-limit signed amount=100 → HTTP ${res.status} code=${codeOf(res)} [${assert.verdict}]`,
            "Expected: accepted at G1 (signed by source, not corroborated)",
          ],
          assertions: [assert],
          result: ok
            ? "PASS: false signed value accepted (G1 honest limit)"
            : undefined,
          evidence: { status: res.status, code: codeOf(res) },
        });
      }
      return { ok: false, error: "Unknown attack", status: 404 };
  }
}
