import { rmSync } from "node:fs";
import { resolve } from "node:path";

const rel = process.argv[2];
if (!rel) {
  console.error("Usage: node tools/scripts/rm-rf.mjs <path>");
  process.exit(1);
}

rmSync(resolve(process.cwd(), rel), { recursive: true, force: true });
