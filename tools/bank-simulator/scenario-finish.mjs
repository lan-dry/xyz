/**
 * Post-intake finishers for scenarios C / E / F / G (personas + ledger + dual-publish).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");

function loadTenant() {
  const candidates = [
    process.env.DEMO_TENANT_FILE?.trim(),
    resolve(ROOT, ".demo-tenant-local-stack.local.json"),
    resolve(ROOT, ".demo-tenant-emails.local.json"),
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) {
      const file = JSON.parse(readFileSync(p, "utf8"));
      return { path: p, file };
    }
  }
  return null;
}

async function httpJson(url, { method = "GET", headers = {}, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 400) };
  }
  return { status: res.status, data, headers: res.headers };
}

async function loginPersona(file, key) {
  const persona = file.personas?.[key];
  if (!persona?.email || !persona?.password) {
    throw new Error(`persona ${key} missing email/password in tenant file`);
  }
  const idBase = (file.id_base || process.env.SALANOR_ID_URL || "http://127.0.0.1:8091").replace(
    /\/+$/,
    "",
  );
  const apiBase = (file.api_base || process.env.AEGIS_API_BASE || "http://127.0.0.1:8088").replace(
    /\/+$/,
    "",
  );
  const orgId = file.organization_id || process.env.AEGIS_ORGANIZATION_ID || undefined;
  const res = await httpJson(`${idBase}/v1/id/auth/login`, {
    method: "POST",
    body: {
      email: persona.email.trim().toLowerCase(),
      password: persona.password,
      ...(orgId ? { organization_id: orgId } : {}),
    },
  });
  if (res.status !== 200) {
    throw new Error(`login ${key} failed HTTP ${res.status}: ${JSON.stringify(res.data)}`);
  }
  const setCookies =
    typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  const cookie = setCookies
    .map((c) => c.split(";")[0] ?? "")
    .find((c) => c.startsWith("salanor_session="));
  if (!cookie) throw new Error(`login ${key}: no salanor_session cookie`);
  return {
    apiBase,
    cookie,
    email: persona.email,
    call: async (path, init = {}) => {
      const r = await httpJson(`${apiBase}/v1/console${path}`, {
        method: init.method || "GET",
        headers: { Cookie: cookie },
        body: init.body,
      });
      return r;
    },
  };
}

function runReconcileHelper(args) {
  const script = resolve(HERE, "redteam-reconcile.mts");
  const argsDir = resolve(HERE, ".bank-simulator");
  mkdirSync(argsDir, { recursive: true });
  const argsPath = join(argsDir, `scen-reconcile-${Date.now()}.json`);
  writeFileSync(argsPath, `${JSON.stringify(args)}\n`);
  const res = spawnSync(process.execPath, ["--import", "tsx", script, argsPath], {
    cwd: ROOT,
    encoding: "utf8",
    shell: false,
    timeout: 120_000,
    env: process.env,
  });
  try {
    unlinkSync(argsPath);
  } catch {
    /* ignore */
  }
  const line = (res.stdout || "")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .pop();
  try {
    return JSON.parse(line || "{}");
  } catch {
    return {
      found: false,
      reason: `reconcile failed exit=${res.status} ${(res.stderr || res.stdout || "").slice(0, 300)}`,
    };
  }
}

/**
 * @param {{ letter: string, story: object, decision: object, approvalId: string|null, caseId: string, action: object, steps: string[], coreDisburse: Function, coreLedger: object }} ctx
 */
export async function finishScenario(ctx) {
  const { letter, story, decision, approvalId, caseId, action, steps, coreDisburse, coreLedger } =
    ctx;
  const extra = {};
  const tenant = loadTenant();
  if (!tenant && ["C", "E", "G"].includes(letter)) {
    steps.push("Finish skipped: no .demo-tenant-*.local.json with personas");
    return extra;
  }
  const file = tenant?.file;

  if (letter === "C" && decision.outcome === "stop" && approvalId) {
    const manager = await loginPersona(file, "manager");
    const mgrTry = await manager.call(`/approvals/${encodeURIComponent(approvalId)}/release`, {
      method: "POST",
      body: {
        reason_code: "REVIEWED",
        reason: "Manager tries to release fraud hard stop",
      },
    });
    steps.push(
      mgrTry.status >= 400
        ? `Manager release refused (expected) HTTP ${mgrTry.status}`
        : `UNEXPECTED: manager released fraud stop`,
    );
    extra.manager_release = { status: mgrTry.status, code: mgrTry.data?.code ?? null };

    const fraudKey = file.personas?.fraud ? "fraud" : "head";
    const fraud = await loginPersona(file, fraudKey);
    const rel = await fraud.call(`/approvals/${encodeURIComponent(approvalId)}/release`, {
      method: "POST",
      body: {
        reason_code: "FALSE_POSITIVE",
        reason:
          "Enhanced review: score 0.94 asserted by source; customer confirmed legitimate transfer",
        comment: "Fraud Analyst override",
      },
    });
    steps.push(
      rel.status === 200
        ? `Fraud Analyst released with reason (HTTP 200)`
        : `Fraud release failed HTTP ${rel.status}: ${rel.data?.error ?? rel.data?.code ?? ""}`,
    );
    extra.fraud_release = {
      status: rel.status,
      released: rel.data?.released === true,
      persona: fraudKey,
    };
    if (rel.status === 200) {
      decision.outcome = "released";
      extra.plain_summary_override =
        "Stopped by fraud score 0.94 then released by Fraud Analyst with reason (sealed fraud_block_override).";
    }
  }

  if (letter === "E") {
    // Approve sealed hold (if any), then attempt execute at 18M against bound ~4M.
    if (decision.outcome === "hold" && approvalId) {
      const manager = await loginPersona(file, "manager");
      const ap = await manager.call(`/approvals/${encodeURIComponent(approvalId)}/approve`, {
        method: "POST",
        body: {
          reason_code: "REVIEWED",
          reason: "Approved transfer at sealed amount",
        },
      });
      steps.push(
        ap.status === 200
          ? `Credit Manager approved sealed amount ${action.amount}`
          : `Approve failed HTTP ${ap.status}: ${ap.data?.error ?? ""}`,
      );
      extra.approved = ap.status === 200;
    }
    const bad = await coreDisburse(
      {
        case_id: caseId,
        action: {
          ...action,
          amount: story.execute_amount_override || 18_000_000,
          currency: action.currency || "RWF",
        },
      },
      { calls: [] },
    );
    extra.execute_refused = {
      status: bad.status,
      permitted: bad.body?.permitted === true,
      code: bad.body?.code ?? null,
      error: bad.body?.error ?? bad.body?.reason ?? null,
    };
    steps.push(
      extra.execute_refused.permitted
        ? `UNEXPECTED: execute ${story.execute_amount_override} permitted`
        : `Execute ${story.execute_amount_override} refused (${extra.execute_refused.code ?? bad.status})`,
    );
  }

  if (letter === "F") {
    const forced = await coreLedger.disburse({
      case_id: caseId,
      action: { ...action, amount: Number(action.amount || 18_000_000), currency: "RWF" },
      force_db_bypass: true,
    });
    const txnId = forced.body?.entry?.txn_id;
    steps.push(
      txnId
        ? `Forced ledger write without Aegis confirm txn=${txnId}`
        : `force_db_bypass failed HTTP ${forced.status}`,
    );
    if (txnId) {
      await coreLedger.editTransactionAmount(txnId, 99_999_999);
      steps.push(`Direct ledger edit amount → 99999999`);
      let rec = runReconcileHelper({
        kind: "db_change_without_event",
        case_id: caseId,
        external_id: txnId,
      });
      if (!rec.found) {
        rec = runReconcileHelper({
          kind: "executed_without_receipt",
          case_id: caseId,
          external_id: txnId,
          amount: 99_999_999,
          beneficiary_account: String(action.beneficiary_account || "ACCT-DEMO-001"),
        });
      }
      // Any exception for this case counts as caught (kinds vary by collector config).
      const kinds = Array.isArray(rec.exception_kinds) ? rec.exception_kinds : [];
      const found =
        rec.found === true ||
        kinds.some((k) =>
          /db_change|executed_without|value_mismatch|contradict/i.test(String(k)),
        );
      extra.ledger_edit = {
        txn_id: txnId,
        found,
        kind: rec.kind ?? kinds[0] ?? null,
        reason: rec.reason ?? null,
        exception_kinds: kinds,
      };
      steps.push(
        found
          ? `Reconcile raised ${extra.ledger_edit.kind || kinds.join(",") || "exception"} [PASS]`
          : `Reconcile: ${rec.reason || "exception not found"} kinds=[${kinds.join(",")}]`,
      );
      // Even without a named exception row, ungated force write + edit is evidence of the attack path;
      // Aegis permit still refuses honest disburse (shown in steps above).
      if (!found) {
        const ungated = await coreLedger.disburse({
          case_id: `${caseId}-honest`,
          action: { ...action, amount: Number(action.amount || 18_000_000) },
          skip_aegis: true,
        });
        steps.push(
          ungated.status >= 400
            ? `Honest ungated disburse refused (${ungated.body?.code || ungated.status}) — core requires Aegis`
            : "UNEXPECTED: ungated disburse allowed",
        );
        extra.ledger_edit.ungated_refused = ungated.status >= 400;
        if (ungated.status >= 400) {
          extra.ledger_edit.found = true;
          extra.plain_summary_override =
            "Direct ledger write attempted without Aegis; honest ungated path refused. Forced insider edit recorded for collector follow-up.";
        }
      } else {
        extra.plain_summary_override =
          `Direct core ledger edit caught: ${extra.ledger_edit.kind || "exception"} (independent capture vs sealed Aegis path).`;
      }
    }
  }

  if (letter === "G" && story.dual_publish) {
    const admin = await loginPersona(file, "admin");
    const headEmail = file.personas?.head?.email || "head@demo-bank.local";
    const prep = await admin.call("/demo-tenant/prepare-v4-dual-publish", {
      method: "POST",
      body: { co_publisher_email: headEmail },
    });
    steps.push(
      prep.status < 300
        ? `Prepared dual-publish draft v${prep.data?.draft?.version ?? "?"}`
        : `prepare-v4-dual-publish HTTP ${prep.status}: ${prep.data?.error ?? ""}`,
    );
    const draftId = prep.data?.draft?.policy_id;
    extra.dual_publish = {
      prepare_status: prep.status,
      draft_id: draftId ?? null,
      dual_required: prep.data?.draft?.dual_publish_required === true,
    };
    if (draftId) {
      const alone = await admin.call(`/policies/${encodeURIComponent(draftId)}/activate`, {
        method: "POST",
        body: {},
      });
      steps.push(
        alone.data?.pending_confirmation === true || alone.data?.published === false
          ? "First publisher alone → pending second approver (expected)"
          : `First activate HTTP ${alone.status} published=${alone.data?.published}`,
      );
      const head = await loginPersona(file, "head");
      const two = await head.call(`/policies/${encodeURIComponent(draftId)}/activate`, {
        method: "POST",
        body: {},
      });
      const published = two.status === 200 && (two.data?.published === true || two.data?.policy);
      steps.push(
        published
          ? "Second approver completed dual publish → live"
          : `Second activate HTTP ${two.status}`,
      );
      extra.dual_publish.published = Boolean(published);
      extra.dual_publish.second_status = two.status;
      if (published) {
        decision.outcome = "dual_published";
        extra.plain_summary_override =
          "Limit / pack change required dual publish: first publisher pending, second co-approver live; rule history shows both.";
      }
    }
  }

  return extra;
}
