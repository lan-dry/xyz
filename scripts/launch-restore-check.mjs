#!/usr/bin/env node
/**
 * Gate 0 backups: Neon PITR → scratch → hash-chain verify.
 * Founder runs once with NEON_API_KEY / project ids; this wraps the drill.
 *
 * Live restore requires Neon credentials. Without them this script documents
 * the steps and exits 2 (not verified).
 */
import { spawnSync } from "node:child_process";

const neonOk =
  Boolean(process.env.NEON_API_KEY?.trim()) &&
  Boolean(process.env.NEON_PROJECT_ID?.trim());

if (!neonOk) {
  console.log(`launch:restore-check — NOT RUN (missing NEON_API_KEY / NEON_PROJECT_ID)

Manual steps for the founder:
1. Neon console → project → Branches → restore to a new scratch branch at a PITR timestamp.
2. Copy the scratch DATABASE_URL into RESTORE_CHECK_DATABASE_URL.
3. pnpm db:migrate (if needed) against that URL.
4. pnpm demo:verify-chain (or tools/demo verify-chain) with that URL.
5. Delete the scratch branch.

When credentials are present, re-run: pnpm launch:restore-check
`);
  process.exit(2);
}

const url = process.env.RESTORE_CHECK_DATABASE_URL?.trim();
if (!url) {
  console.error("Set RESTORE_CHECK_DATABASE_URL to the scratch branch connection string.");
  process.exit(2);
}

console.log("launch:restore-check: verifying chain on scratch…");
const r = spawnSync(
  "pnpm",
  ["--filter", "@salanor/demo-tools", "verify-chain"],
  {
    env: { ...process.env, DATABASE_URL: url },
    encoding: "utf8",
    stdio: "inherit",
    shell: true,
  },
);
process.exit(r.status ?? 1);
