import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "app");
const src = path.join(root, "(console)", "console");
const dest = path.join(root, "app", "console", "aegis");
const docsSrc = path.join(root, "(marketing)", "aegis", "docs", "page.tsx");
const docsDest = path.join(root, "docs", "aegis", "page.tsx");

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const fromPath = path.join(from, entry.name);
    const toPath = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(fromPath, toPath);
    } else if (entry.name !== "layout.tsx") {
      fs.copyFileSync(fromPath, toPath);
    }
  }
}

copyDir(src, dest);
fs.mkdirSync(path.dirname(docsDest), { recursive: true });
fs.copyFileSync(docsSrc, docsDest);
const log = path.join(path.dirname(fileURLToPath(import.meta.url)), "copy-log.txt");
fs.writeFileSync(log, `dest exists: ${fs.existsSync(dest)} files: ${fs.readdirSync(dest).join(",")}\n`);
console.log("Copied console routes to", dest);
