#!/usr/bin/env node
/**
 * TypeScript leg of SDK signing conformance (reads sdks/conformance/vectors).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { digestHex, signEvent } from "@salanor/aegis";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const vectorPath = join(root, "sdks/conformance/vectors/signing-digest-v1.json");
const { cases } = JSON.parse(readFileSync(vectorPath, "utf8"));

let failed = 0;

for (const c of cases) {
  const got = digestHex(c.event, c.key_id);
  if (got !== c.digest_hex) {
    console.error(`[typescript] ${c.name}: digest mismatch\n  got:  ${got}\n  want: ${c.digest_hex}`);
    failed++;
  }

  if (c.private_key_seed_b64 && c.sig_value_b64) {
    const signed = await signEvent(c.event, {
      privateKeyB64: c.private_key_seed_b64,
      keyId: c.key_id,
    });
    if (signed.sig_value_b64 !== c.sig_value_b64) {
      console.error(
        `[typescript] ${c.name}: signature mismatch\n  got:  ${signed.sig_value_b64}\n  want: ${c.sig_value_b64}`,
      );
      failed++;
    }
  }
}

if (failed > 0) {
  console.error(`[typescript] ${failed} failure(s)`);
  process.exit(1);
}

console.log(`[typescript] ${cases.length} case(s) OK`);
