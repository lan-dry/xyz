#!/usr/bin/env node
/**
 * Fails if FINAL_REPORT / GAP_REPORT / DEMO disagree on shared requirement status tokens.
 * Heuristic: for each REQ id like "T1.1" or known keys, status words must match.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const files = {
  FINAL: join(root, "docs/FINAL_REPORT.md"),
  GAP: join(root, "docs/GAP_REPORT.md"),
  DEMO: join(root, "docs/DEMO.md"),
  WEB: join(root, "docs/WEBSITE_CHANGES.md"),
};

const KEYS = [
  ["Website live publish", /website.*live.*publish/i],
  ["approvals=http", /approvals=http/i],
  ["escalate_to_role", /escalate_to_role/i],
  ["Time-bound delegation", /time-bound delegation|approval_delegate/i],
  ["Bundle export", /export:scenario-bundles|bundle export/i],
  ["demo:up", /demo:up/i],
];

function statusNear(text, re) {
  const m = text.match(re);
  if (!m) return "missing";
  const slice = text.slice(Math.max(0, m.index - 80), m.index + 200);
  if (/not done|not yet|by design.*not/i.test(slice) && /publish/i.test(slice))
    return "not_done";
  if (/\*\*Present\*\*|PASS|Present \+|live E2E PASS|Done/i.test(slice))
    return "present";
  if (/Partial|partial/i.test(slice)) return "partial";
  if (/fixture only|simulation/i.test(slice)) return "fixture";
  return "mentioned";
}

let failed = 0;
for (const [name, path] of Object.entries(files)) {
  if (!existsSync(path)) {
    console.error(`MISSING ${name}: ${path}`);
    failed++;
  }
}

const texts = Object.fromEntries(
  Object.entries(files)
    .filter(([, p]) => existsSync(p))
    .map(([k, p]) => [k, readFileSync(p, "utf8")]),
);

for (const [label, re] of KEYS) {
  const statuses = {};
  for (const [doc, text] of Object.entries(texts)) {
    statuses[doc] = statusNear(text, re);
  }
  const vals = Object.values(statuses);
  // Website publish: FINAL/GAP/DEMO must all say not_done or missing consistently
  if (label === "Website live publish") {
    const bad = Object.entries(statuses).filter(
      ([doc, s]) =>
        doc !== "WEB" && s !== "not_done" && s !== "missing" && s !== "mentioned",
    );
    if (bad.length) {
      console.error(`DISAGREE ${label}:`, statuses);
      failed++;
    } else {
      console.log(`OK ${label}:`, statuses);
    }
    continue;
  }
  const core = ["FINAL", "GAP", "DEMO"].map((d) => statuses[d]);
  const presentish = core.filter((s) => s === "present" || s === "mentioned");
  const absent = core.filter((s) => s === "missing");
  if (presentish.length > 0 && absent.length > 0) {
    console.error(`DISAGREE ${label}:`, statuses);
    failed++;
  } else {
    console.log(`OK ${label}:`, statuses);
  }
}

console.log(failed === 0 ? "status-docs-agree: PASS" : `status-docs-agree: FAIL (${failed})`);
process.exit(failed > 0 ? 1 : 0);
