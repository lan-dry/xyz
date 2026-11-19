/**
 * One real bank path: LOS / Core / Pay Connectors (registered keys), Core/Pay refuse
 * without confirm, Core exports ledger feed, reconciliation via API, case G1→G2.
 *
 * Requires: aegis-api up, provisioned Demo Bank, demo:connectors or in-process RealConnectors,
 * BANK / DEMO ingest env as used by bank-simulator.
 *
 * Usage: node docs/provenance/bank-g1-g2.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const outDir = join(here, "_raw");
mkdirSync(outDir, { recursive: true });

const SIM = (process.env.BANK_SIMULATOR_URL ?? "http://127.0.0.1:4000").replace(/\/+$/, "");
const API = (process.env.AEGIS_API_BASE ?? "http://127.0.0.1:8088").replace(/\/+$/, "");
const lines = [];

function log(msg) {
  console.log(msg);
  lines.push(msg);
}

async function jfetch(url, init = {}) {
  const headers = {
    ...(init.headers || {}),
    "x-simulator": "1",
  };
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

log(`=== bank G1→G2 @ ${new Date().toISOString()} ===`);
log(`simulator=${SIM} api=${API}`);

const health = await jfetch(`${SIM}/health`);
log(`health HTTP ${health.status} ${JSON.stringify(health.body)}`);

const systems = await jfetch(`${SIM}/api/systems`);
log(`systems HTTP ${systems.status}`);
log(JSON.stringify(systems.body, null, 2));

// Core refuses without confirm / token
const refuse = await jfetch(`${SIM}/api/disburse/skip-aegis`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    case_id: `G2-REFUSE-${Date.now()}`,
    action: { amount: 1_500_000, currency: "RWF" },
  }),
});
log(`\nCore skip-aegis (expect refuse) HTTP ${refuse.status}`);
log(JSON.stringify(refuse.body, null, 2));

// Run a small story if available
const story = await jfetch(`${SIM}/api/story`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ story_id: "loan_within_limit" }),
});
log(`\nstory loan_within_limit HTTP ${story.status}`);
log(JSON.stringify(story.body, null, 2).slice(0, 4000));

// Export core feed
const feed = await jfetch(`${SIM}/api/feed/export`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ format: "jsonl" }),
});
log(`\nfeed export HTTP ${feed.status}`);
log(JSON.stringify(feed.body, null, 2));

// Red Team #5 altered execution
const rt5 = await jfetch(`${SIM}/api/redteam/run`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ attack_id: 5 }),
});
log(`\nRed Team #5 HTTP ${rt5.status} simulated=${rt5.body?.simulated}`);
log(JSON.stringify(rt5.body, null, 2).slice(0, 3000));

const outPath = join(outDir, `bank_g1_g2_${Date.now()}.txt`);
writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
log(`\nwrote ${outPath}`);
