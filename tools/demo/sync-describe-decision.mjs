#!/usr/bin/env node
/**
 * Regenerate apps/web-console/src/lib/describe-decision.ts from the API source of truth
 * (services/aegis-api/src/bank/describe-decision.ts). The console cannot import aegis-api,
 * so it carries a copy; only the two type imports are inlined.
 *
 *   node tools/demo/sync-describe-decision.mjs          # write the copy
 *   node tools/demo/sync-describe-decision.mjs --check  # exit 1 when the copy is stale
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = join(root, "services", "aegis-api", "src", "bank", "describe-decision.ts");
const dest = join(root, "apps", "web-console", "src", "lib", "describe-decision.ts");

const importBlock =
  /import type \{ DecisionBasis \} from "\.\/decision-basis\.js";\r?\nimport type \{ BankOutcome \} from "\.\/outcome\.js";\r?\n/;

const inlined = `/**
 * COPY of services/aegis-api/src/bank/describe-decision.ts. The console cannot import
 * aegis-api, so keep this file identical below the type block (same wording on screen,
 * PDF and CSV). Regenerate with: node tools/demo/sync-describe-decision.mjs
 */

export type BankOutcome = "allow" | "hold" | "stop";

export type DecisionBasis = {
  outcome: BankOutcome | string;
  decided_by_rule_id: string | null;
  explanation: string;
  matched: Array<{
    rule_id: string;
    policy_id: string;
    decision: string;
    effect: string;
    note?: string;
  }>;
};
`;

const source = readFileSync(src, "utf8");
if (!importBlock.test(source)) {
  console.error("API describe-decision.ts no longer has the expected type imports; update this script.");
  process.exit(1);
}
const next = source.replace(importBlock, inlined).replace(/\r\n/g, "\n");

if (process.argv.includes("--check")) {
  const current = readFileSync(dest, "utf8").replace(/\r\n/g, "\n");
  if (current !== next) {
    console.error("apps/web-console/src/lib/describe-decision.ts is out of sync with the API copy.");
    process.exit(1);
  }
  console.log("describe-decision copy is in sync.");
} else {
  writeFileSync(dest, next);
  console.log("wrote", dest);
}
