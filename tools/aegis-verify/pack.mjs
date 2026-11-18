/**
 * Build a single offline download folder: dist/aegis-verify/
 * Copies the CLI sources + a small runner. Auditors run npm install once.
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "dist", "aegis-verify");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const name of ["cli.mts", "merkle.ts", "README.md", "keys.example.json"]) {
  cpSync(join(here, name), join(outDir, name));
}

const pkg = {
  name: "aegis-verify",
  version: "0.1.0",
  private: true,
  type: "module",
  bin: { "aegis-verify": "./run.mjs" },
  scripts: {
    verify: "node run.mjs",
    test: "node --import tsx --test merkle.test.ts",
  },
  dependencies: {
    "@noble/ed25519": "^2.2.3",
    "tsx": "^4.19.4",
  },
};
writeFileSync(join(outDir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);

const runner = `#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const tsxCli = join(here, "node_modules", "tsx", "dist", "cli.mjs");
const entry = join(here, "cli.mts");
const result = spawnSync(process.execPath, [tsxCli, entry, ...process.argv.slice(2)], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
`;
writeFileSync(join(outDir, "run.mjs"), runner);

console.log(`Packed ${outDir}`);
console.log("Next: cd tools/aegis-verify/dist/aegis-verify && npm install --omit=dev");
console.log("Then: node run.mjs <bundle.json> --keys keys.json");
