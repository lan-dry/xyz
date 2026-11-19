/**
 * One real bank path: story → G1 → execute/confirm → export feed → reconcile → G2.
 *
 * Usage: node docs/provenance/bank-g1-g2.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const outDir = join(here, "_raw");
mkdirSync(outDir, { recursive: true });

function loadEnv(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
  }
}
loadEnv(join(root, ".env"));
loadEnv(join(root, ".env.local"));
loadEnv(join(root, "services/aegis-api/.env"));

const tenantPath = join(root, ".demo-tenant-local-stack.local.json");
const tenant = existsSync(tenantPath)
  ? JSON.parse(readFileSync(tenantPath, "utf8"))
  : {};

const SIM = (process.env.BANK_SIMULATOR_URL ?? "http://127.0.0.1:4000").replace(
  /\/+$/,
  "",
);
const API = (
  tenant.api_base ||
  process.env.AEGIS_API_BASE ||
  "http://127.0.0.1:8088"
).replace(/\/+$/, "");
const INGEST = tenant.ingest_key || process.env.AEGIS_INGEST_KEY || "";
const CONSOLE = (
  tenant.console_origin ||
  process.env.AEGIS_CONSOLE_ORIGIN ||
  "http://127.0.0.1:3000"
).replace(/\/+$/, "");

const lines = [];
function log(msg) {
  console.log(msg);
  lines.push(msg);
}

async function jfetch(url, init = {}) {
  const headers = {
    "content-type": "application/json",
    "x-simulator": "1",
    ...(init.headers || {}),
  };
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

log(`=== bank G1→G2 @ ${new Date().toISOString()} ===`);
log(`simulator=${SIM} api=${API} console=${CONSOLE}`);

const health = await jfetch(`${SIM}/health`);
log(`health HTTP ${health.status} ${JSON.stringify(health.body)}`);
if (health.status !== 200) {
  writeFileSync(join(outDir, "bank_g1_g2.txt"), lines.join("\n") + "\n");
  process.exit(1);
}

const systems = await jfetch(`${SIM}/api/systems`);
log(`systems HTTP ${systems.status}`);
log(
  JSON.stringify(
    (systems.body?.systems || []).map((s) => ({
      id: s.id,
      source_id: s.source_id,
      connected: s.connected,
      last_seq: s.last_seq,
      mode: s.mode,
    })),
    null,
    2,
  ),
);

// Core refuses without confirm / token
const refuse = await jfetch(`${SIM}/api/disburse/skip-aegis`, {
  method: "POST",
  body: JSON.stringify({
    case_id: `G2-REFUSE-${Date.now()}`,
    action: { amount: 1_500_000, currency: "RWF" },
  }),
});
log(`\nCore skip-aegis (expect refuse) HTTP ${refuse.status}`);
log(`code=${refuse.body?.code ?? refuse.body?.body?.code ?? "?"}`);

// Story → G1 (source-signed allow + token)
const story = await jfetch(`${SIM}/api/story`, {
  method: "POST",
  body: JSON.stringify({ story_id: "loan_within_limit" }),
});
log(`\nstory loan_within_limit HTTP ${story.status}`);
const s = story.body || {};
log(
  `case_id=${s.case_id} trace_id=${s.trace_id} outcome=${s.outcome} grade_hint=${s.evidence_grade ?? s.target_grade} has_token=${Boolean(s.decision_token)}`,
);
log(`steps: ${(s.steps || []).join(" | ")}`);
if (story.status !== 200 || s.outcome !== "allow" || !s.case_id) {
  log("FAIL: story did not allow");
  writeFileSync(join(outDir, "bank_g1_g2.txt"), lines.join("\n") + "\n");
  process.exit(1);
}
log(`G1 case URL: ${CONSOLE}/aegis/traces/${s.trace_id}`);
log(`G1 PASS: source-signed allow (evidence_grade target ${s.target_grade})`);

const token = s.decision_token;
const params = {
  amount: s.action?.amount ?? 1_200_000,
  currency: s.action?.currency ?? "RWF",
  beneficiary_account:
    s.action?.beneficiary_account ??
    s.action?.account_id ??
    "ACCT-DEMO-001",
  product: "retail_loan",
};
if (!token) {
  log("FAIL: no decision_token on allow story (pack executable_params missing?)");
  writeFileSync(join(outDir, "bank_g1_g2.txt"), lines.join("\n") + "\n");
  process.exit(1);
}

// Disburse while outcome is still allow (permit gate), then confirm token.
const disburse = await jfetch(`${SIM}/api/disburse`, {
  method: "POST",
  body: JSON.stringify({ case_id: s.case_id, action: params }),
});
log(
  `\ndisburse HTTP ${disburse.status} permitted=${disburse.body?.permitted} txn=${disburse.body?.entry?.id ?? disburse.body?.entry?.txn_id ?? "?"}`,
);
if (disburse.status !== 200 || disburse.body?.ok === false) {
  log(`FAIL: disburse ${JSON.stringify(disburse.body).slice(0, 500)}`);
  writeFileSync(join(outDir, "bank_g1_g2.txt"), lines.join("\n") + "\n");
  process.exit(1);
}

const confirm = await jfetch(`${API}/v1/aegis/executions/confirm`, {
  method: "POST",
  headers: { Authorization: `Bearer ${INGEST}` },
  body: JSON.stringify({ token, params }),
});
log(
  `confirm HTTP ${confirm.status} code=${confirm.body?.code} ok=${confirm.body?.ok}`,
);
if (confirm.status !== 200 || confirm.body?.ok === false) {
  log(`FAIL: confirm ${JSON.stringify(confirm.body).slice(0, 500)}`);
  writeFileSync(join(outDir, "bank_g1_g2.txt"), lines.join("\n") + "\n");
  process.exit(1);
}
log("EXECUTE PASS: permit disburse + confirm matched");

const feed = await jfetch(`${SIM}/api/feed/export`, {
  method: "POST",
  body: JSON.stringify({ format: "jsonl" }),
});
log(`\nfeed export HTTP ${feed.status} path=${feed.body?.path} rows=${feed.body?.rows}`);
if (feed.status !== 200 || !feed.body?.path) {
  log("FAIL: feed export");
  writeFileSync(join(outDir, "bank_g1_g2.txt"), lines.join("\n") + "\n");
  process.exit(1);
}
log("EXPORT PASS");

// Console reconcile via tsx helper (ConsoleSession is TypeScript).
const reconScript = join(outDir, "_g1_g2_reconcile.mts");
writeFileSync(
  reconScript,
  `import { readFileSync } from "node:fs";
import { ConsoleSession } from "../../../tools/demo/demo-tenant-lib.mts";
const tenant = JSON.parse(readFileSync(".demo-tenant-local-stack.local.json", "utf8"));
const feedPath = process.argv[2];
const caseId = process.argv[3];
const admin = tenant.personas?.admin;
if (!admin?.email) throw new Error("admin persona missing");
const session = await ConsoleSession.loginResolved(tenant, admin);
const feedCreate = await session.call("/reconciliation/feeds", {
  method: "POST",
  body: {
    name: \`core-ledger-\${Date.now()}\`,
    format: "jsonl",
    source_system: "demo_core",
    match_key: "case_id",
  },
  okStatuses: [200, 201],
});
const feedId = feedCreate.data?.feed?.feed_id || feedCreate.data?.feed_id;
if (!feedId) throw new Error("feed create returned no feed_id: " + JSON.stringify(feedCreate));
const bodyText = readFileSync(feedPath, "utf8");
const ingested = await session.call(\`/reconciliation/feeds/\${encodeURIComponent(feedId)}/ingest\`, {
  method: "POST",
  body: { body: bodyText, format: "jsonl" },
  okStatuses: [200, 201],
});
const now = new Date();
const run = await session.call("/reconciliation/runs", {
  method: "POST",
  body: {
    feed_id: feedId,
    period_start: new Date(now.getTime() - 86400000).toISOString(),
    period_end: new Date(now.getTime() + 3600000).toISOString(),
  },
  okStatuses: [200, 201],
});
console.log(JSON.stringify({
  feed_id: feedId,
  inserted: ingested.data?.inserted,
  row_count: ingested.data?.row_count,
  run_id: run.data?.run_id,
  matched: run.data?.report?.matched_count,
  exceptions: run.data?.report?.exception_count,
  case_id: caseId,
}));
`,
);

const reconProc = spawnSync(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["exec", "tsx", reconScript, feed.body.path, s.case_id],
  { cwd: root, encoding: "utf8", shell: true },
);
log(reconProc.stdout || "");
if (reconProc.stderr) log(reconProc.stderr.slice(0, 800));
let reconOk = reconProc.status === 0;
let grade = null;
try {
  const last = (reconProc.stdout || "").trim().split(/\r?\n/).filter(Boolean).at(-1);
  const parsed = JSON.parse(last || "{}");
  reconOk = reconOk && Boolean(parsed.run_id);
  log(
    `reconcile feed=${parsed.feed_id} run=${parsed.run_id} matched=${parsed.matched} exceptions=${parsed.exceptions}`,
  );
} catch (err) {
  log(`reconcile parse failed: ${err.message}`);
  reconOk = false;
}

if (!reconOk) {
  log("FAIL: reconcile");
  writeFileSync(join(outDir, "bank_g1_g2.txt"), lines.join("\n") + "\n");
  process.exit(1);
}
log("RECONCILE PASS");

log(`\nG2 case URL: ${CONSOLE}/aegis/traces/${s.trace_id}`);
log(
  `OVERALL: PASS — G1 → disburse → confirm → export → reconcile (target=${s.target_grade} observed=${grade ?? "n/a"})`,
);

const outPath = join(outDir, "bank_g1_g2.txt");
writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
log(`\nwrote ${outPath}`);
process.exit(0);
