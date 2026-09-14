import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseExportPackJson, verifyExportPack } from "@salanor/aegis-ledger-sdk";

const packPath = process.argv[2];
if (!packPath) {
  console.error("Usage: pnpm aegis:verify-pack <path-to-export.json>");
  process.exit(1);
}

const abs = resolve(packPath);
const raw = readFileSync(abs, "utf8");
const pack = parseExportPackJson(raw);
const result = verifyExportPack(pack);

console.log(`[verify-pack] file=${abs}`);
console.log(`[verify-pack] events=${result.event_count} ok=${result.ok}`);
if (result.merkle_root) {
  console.log(`[verify-pack] merkle_root=${result.merkle_root}`);
}
if (result.anchor_status) {
  console.log(`[verify-pack] anchor_status=${result.anchor_status}`);
}
if (result.witness_valid !== undefined) {
  console.log(`[verify-pack] witness_valid=${result.witness_valid}`);
}

if (!result.ok) {
  for (const err of result.errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log("[verify-pack] export pack verified.");
process.exit(0);
