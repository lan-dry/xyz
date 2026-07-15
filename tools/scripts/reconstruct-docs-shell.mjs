#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const transcriptPath = process.argv[2];
const outPath = process.argv[3];
const target = "apps/web-docs/src/components/docs-shell.tsx";

function norm(raw) {
  return (raw ?? "")
    .replace(/\\/g, "/")
    .toLowerCase()
    .replace(/^d:\/projects\/salanor\//, "");
}

let content = null;
for (const line of fs.readFileSync(transcriptPath, "utf8").split("\n")) {
  if (!line.trim()) continue;
  let row;
  try {
    row = JSON.parse(line);
  } catch {
    continue;
  }
  for (const part of row.message?.content ?? []) {
    if (part.type !== "tool_use") continue;
    const rel = norm(part.input?.path);
    if (!rel.endsWith(target)) continue;
    if (part.name === "Write" && part.input?.contents) {
      if (!part.input.contents.includes("</motion>")) {
        content = part.input.contents;
      }
    } else if (
      part.name === "StrReplace" &&
      content &&
      part.input?.old_string &&
      content.includes(part.input.old_string)
    ) {
      content = content.replace(part.input.old_string, part.input.new_string ?? "");
    }
  }
}

if (!content) {
  console.error("Could not reconstruct docs-shell");
  process.exit(1);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, content, "utf8");
console.log("Wrote", outPath, content.length, "bytes");
