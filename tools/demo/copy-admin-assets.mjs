#!/usr/bin/env node
/** Copy non-TS assets needed by the compiled Railway admin CLIs into dist/. */
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "dist");
mkdirSync(dist, { recursive: true });

for (const name of ["demo-bank-history.example.json", "demo-fresh.mjs"]) {
  const src = join(here, name);
  if (!existsSync(src)) {
    console.error(`copy-admin-assets: missing ${src}`);
    process.exit(1);
  }
  copyFileSync(src, join(dist, name));
}

console.log("Admin assets copied to tools/demo/dist/");
