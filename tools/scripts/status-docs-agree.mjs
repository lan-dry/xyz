#!/usr/bin/env node
/**
 * Fails if status docs disagree across files OR contradict themselves.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const paths = {
  FINAL: join(root, "docs/FINAL_REPORT.md"),
  GAP: join(root, "docs/GAP_REPORT.md"),
  DEMO: join(root, "docs/DEMO.md"),
  WEB: join(root, "docs/WEBSITE_CHANGES.md"),
};

const texts = {};
let failed = 0;
for (const [name, p] of Object.entries(paths)) {
  if (!existsSync(p)) {
    console.error(`MISSING ${name}`);
    failed++;
    continue;
  }
  texts[name] = readFileSync(p, "utf8");
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed++;
}
function ok(msg) {
  console.log(`OK ${msg}`);
}

// --- Cross-doc: website must not claim live publish Done ---
for (const [name, text] of Object.entries(texts)) {
  if (/live publish[^\n]{0,80}\*\*Done\*\*/i.test(text)) {
    fail(`${name}: claims website live publish Done`);
  }
}
const publishOk =
  /not (done|publish)|do not publish|no live publish|awaiting founder/i.test(
    Object.values(texts).join("\n"),
  );
if (!publishOk) fail("Website live publish honesty marker missing");
else ok("website live publish = not done / preview only");

const requiredMentions = [
  "approvals=http",
  "demo:up",
  "escalate",
  "export:scenario-bundles",
  "AEGIS_DEMO_APPROVAL_PASSWORD",
];
for (const phrase of requiredMentions) {
  const missing = ["FINAL", "GAP", "DEMO"].filter(
    (d) => texts[d] && !texts[d].toLowerCase().includes(phrase.toLowerCase()),
  );
  const soft =
    phrase === "AEGIS_DEMO_APPROVAL_PASSWORD"
      ? missing.filter((d) => d !== "GAP")
      : missing;
  if (soft.length) fail(`missing "${phrase}" in: ${soft.join(",")}`);
  else ok(`mention: ${phrase}`);
}

// --- Intra-doc contradictions in FINAL_REPORT ---
const final = texts.FINAL ?? "";

/** Extract §9 status for an item id prefix like "1.1" or "2.4". */
function section9Status(id) {
  const re = new RegExp(
    `\\|\\s*${id.replace(".", "\\.")}[^|]*\\|\\s*\\*\\*(Done|Partial|Not done)\\*\\*`,
    "i",
  );
  const m = final.match(re);
  return m ? m[1].toLowerCase() : null;
}

const s91_1 = section9Status("1\\.1");
const s92_4 = section9Status("2\\.4");
const s92_3 = section9Status("2\\.3");
const s92_5 = section9Status("2\\.5");

// §2 must not call scenarios 4–7 "Fixture only" if §9 1.1 claims Done for HTTP live path,
// and must not claim universal Done without receipt_kind proof language.
if (/## 2\./.test(final)) {
  const sec2 = final.split(/## 2\./)[1]?.split(/## 3\./)[0] ?? "";
  if (
    /\| 4 \|[^\n]*Fixture only/i.test(sec2) &&
    /1\.1[^\n]*\*\*Done\*\*/i.test(final)
  ) {
    fail(
      "FINAL §2 calls scenario 4 Fixture only while §9 marks 1.1 Done — reconcile",
    );
  }
  if (
    /\| 12 \|[^\n]*In-memory/i.test(sec2) &&
    /1\.1[^\n]*\*\*Done\*\*/i.test(final) &&
    !/Partial/i.test(final.match(/\| 1\.1[^\n]+/)?.[0] ?? "")
  ) {
    fail(
      "FINAL §2 still says scenario 12 in-memory while §9 1.1 is Done without Partial",
    );
  }
  ok("checked §2 vs §9 scenario claims");
}

// §3 / §4 vs §9
if (/## 3\./.test(final)) {
  const sec3 = final.split(/## 3\./)[1]?.split(/## 4\./)[0] ?? "";
  if (
    /Backup\/restore[^\n]*\*\*Not done\*\*/i.test(sec3) &&
    s92_4 === "done"
  ) {
    fail("FINAL §3 Backup/restore Not done vs §9 2.4 Done");
  }
  if (/OIDC[^\n]*Doc only/i.test(sec3) && s92_3 === "done") {
    fail("FINAL §3 OIDC Doc only vs §9 2.3 Done");
  }
  if (/Canned reports[^\n]*Stub UI/i.test(sec3) && /reports[^\n]*Real canned/i.test(final)) {
    fail("FINAL §3 Canned reports Stub UI vs §8 Real canned");
  }
  ok("checked §3 vs §9");
}

if (/## 4\./.test(final)) {
  const sec4 = final.split(/## 4\./)[1]?.split(/## 5\./)[0] ?? "";
  const stillLists = [
    [/Backup → restore/i, s92_4 === "done", "2.4 backup"],
    [/OIDC claim/i, s92_3 === "done", "2.3 OIDC"],
    [/Webhook retry/i, s92_5 === "done", "2.5 webhook"],
    [/Escalation to a role/i, /1\.3[^\n]*\*\*Done\*\*/i.test(final), "1.3 escalate"],
    [/Time-bound delegation/i, /1\.3[^\n]*\*\*Done\*\*/i.test(final), "1.3 delegation"],
    [/Expand `--approvals=http` beyond scenario 2/i, true, "http beyond 2"],
  ];
  for (const [re, isDone, label] of stillLists) {
    if (re.test(sec4) && isDone) {
      fail(`FINAL §4 still lists "${label}" as not done while §9 says Done`);
    }
  }
  ok("checked §4 vs §9");
}

// §9 1.1: if Done must cite paste; Partial is required when §2 still has FAIL rows
const row11 = final.match(/\| 1\.1[^\n]+/);
if (row11) {
  const row = row11[0];
  const sec2 = final.split(/## 2\./)[1]?.split(/## 3\./)[0] ?? "";
  const hasFail = /FAIL scenario/i.test(sec2);
  if (/\*\*Done\*\*/i.test(row) && hasFail) {
    fail("§9 1.1 Done while §2 still contains FAIL scenario lines");
  } else if (
    /\*\*Done\*\*/i.test(row) &&
    !/pasted|raw|receipt_kind|§2/i.test(row)
  ) {
    fail("§9 1.1 Done without proof language");
  } else {
    ok("§9 1.1 status language");
  }
}

console.log(
  failed === 0
    ? "status-docs-agree: PASS"
    : `status-docs-agree: FAIL (${failed})`,
);
process.exit(failed > 0 ? 1 : 0);
