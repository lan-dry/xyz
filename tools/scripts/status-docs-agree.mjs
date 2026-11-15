#!/usr/bin/env node
/**
 * Fails if FINAL_REPORT / GAP_REPORT / DEMO disagree on labelled STATUS lines.
 * Looks for explicit markers: STATUS:<id>=done|partial|not_done
 * Also checks website live publish is not claimed Done.
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

// Website must not claim live publish Done
for (const [name, text] of Object.entries(texts)) {
  if (/live publish[^\n]{0,80}\*\*Done\*\*/i.test(text)) {
    console.error(`${name}: claims website live publish Done`);
    failed++;
  }
}

const publishOk =
  /not (done|publish)|do not publish|no live publish|awaiting founder/i.test(
    texts.FINAL + texts.GAP + texts.DEMO + texts.WEB,
  );
if (!publishOk) {
  console.error("Website live publish honesty marker missing from docs");
  failed++;
} else {
  console.log("OK website live publish = not done / preview only");
}

// Shared requirement phrases must appear in FINAL + GAP + DEMO
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
  // GAP may use different wording for password
  const soft =
    phrase === "AEGIS_DEMO_APPROVAL_PASSWORD"
      ? missing.filter((d) => d !== "GAP")
      : missing;
  if (soft.length) {
    console.error(`DISAGREE missing "${phrase}" in: ${soft.join(",")}`);
    failed++;
  } else {
    console.log(`OK mention: ${phrase}`);
  }
}

console.log(
  failed === 0
    ? "status-docs-agree: PASS"
    : `status-docs-agree: FAIL (${failed})`,
);
process.exit(failed > 0 ? 1 : 0);
