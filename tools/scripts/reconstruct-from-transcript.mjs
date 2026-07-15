#!/usr/bin/env node
/**
 * Reconstruct salanor files by replaying Write/StrReplace from Cursor agent transcript.
 * Usage: node tools/scripts/reconstruct-from-transcript.mjs [transcript.jsonl] [destRoot]
 */
import fs from "node:fs";
import path from "node:path";

const transcriptPath =
  process.argv[2] ??
  path.join(
    process.env.USERPROFILE ?? "",
    ".cursor/projects/d-PROJECTS-salanor/agent-transcripts/4d7054be-39fe-4e30-9877-f636fb713063/4d7054be-39fe-4e30-9877-f636fb713063.jsonl",
  );
const destRoot = path.resolve(
  process.argv[3] ?? "D:/PROJECTS/salanor-rebuilt",
);

function normalizeProjectPath(raw) {
  if (!raw) return null;
  let p = raw.replace(/\\/g, "/");
  const idx = p.toLowerCase().indexOf("/projects/salanor/");
  if (idx === -1) return null;
  p = p.slice(idx + "/projects/salanor/".length);
  return p.split("/").join(path.sep);
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

const files = new Map();
let writes = 0;
let replaces = 0;
let skipped = 0;

const text = fs.readFileSync(transcriptPath, "utf8");
for (const line of text.split("\n")) {
  if (!line.trim()) continue;
  let row;
  try {
    row = JSON.parse(line);
  } catch {
    continue;
  }
  const parts = row.message?.content ?? [];
  for (const part of parts) {
    if (part.type !== "tool_use") continue;
    const name = part.name;
    const input = part.input ?? {};
    const rel = normalizeProjectPath(input.path ?? input.target_notebook);
    if (!rel) {
      skipped++;
      continue;
    }
    const abs = path.join(destRoot, rel);

    if (name === "Write") {
      const contents =
        input.contents ?? input.new_string ?? "";
      ensureDir(abs);
      fs.writeFileSync(abs, contents, "utf8");
      files.set(rel, contents);
      writes++;
    } else if (name === "StrReplace") {
      const oldStr = input.old_string;
      const newStr = input.new_string ?? "";
      if (oldStr === undefined) continue;
      let current = files.get(rel);
      if (current === undefined && fs.existsSync(abs)) {
        current = fs.readFileSync(abs, "utf8");
      }
      if (current === undefined) {
        skipped++;
        continue;
      }
      if (!current.includes(oldStr)) {
        skipped++;
        continue;
      }
      current = current.replace(oldStr, newStr);
      ensureDir(abs);
      fs.writeFileSync(abs, current, "utf8");
      files.set(rel, current);
      replaces++;
    } else if (name === "EditNotebook") {
      // skip notebooks for now
      skipped++;
    }
  }
}

const written = [...files.keys()].length;
console.log(JSON.stringify({ destRoot, writes, replaces, skipped, uniqueFiles: written }, null, 2));
