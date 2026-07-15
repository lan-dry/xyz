#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const transcriptPath = process.argv[2];
const relTarget = process.argv[3].replace(/\\/g, "/").toLowerCase();
const outPath = process.argv[4];

function norm(raw) {
  if (!raw) return "";
  return raw
    .replace(/\\/g, "/")
    .toLowerCase()
    .replace(/^d:\/projects\/salanor\//, "");
}

const lines = fs.readFileSync(transcriptPath, "utf8").split("\n").filter(Boolean);
let content = null;

for (const line of lines) {
  let row;
  try {
    row = JSON.parse(line);
  } catch {
    continue;
  }
  for (const part of row.message?.content ?? []) {
    if (part.type !== "tool_use") continue;
    const input = part.input ?? {};
    const rel = norm(input.path ?? "");
    if (!rel.endsWith(relTarget)) continue;
    if (part.name === "Write" && input.contents) {
      content = input.contents;
    } else if (part.name === "StrReplace" && content && input.old_string !== undefined) {
      if (!content.includes(input.old_string)) {
        console.warn("StrReplace miss:", rel);
        continue;
      }
      content = content.replace(input.old_string, input.new_string ?? "");
    }
  }
}

if (!content) {
  console.error("No content reconstructed for", relTarget);
  process.exit(1);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, content, "utf8");
console.log("Wrote", outPath, content.length, "bytes");
