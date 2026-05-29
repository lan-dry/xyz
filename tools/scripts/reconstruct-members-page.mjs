#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const transcriptPath =
  process.argv[2] ??
  path.join(
    process.env.USERPROFILE ?? "",
    ".cursor/projects/d-PROJECTS-salanor/agent-transcripts/4d7054be-39fe-4e30-9877-f636fb713063/4d7054be-39fe-4e30-9877-f636fb713063.jsonl",
  );
const outPath =
  process.argv[3] ??
  "D:/PROJECTS/salanor-rebuilt/apps/web-console/src/app/aegis/members/page.tsx";

function norm(raw) {
  return (raw ?? "")
    .replace(/\\/g, "/")
    .toLowerCase()
    .replace(/^d:\/projects\/salanor\//, "");
}

const SETTINGS = "apps/web-console/src/app/aegis/settings/members/page.tsx";
const MEMBERS = "apps/web-console/src/app/aegis/members/page.tsx";

let settings = null;
let members = null;

const lines = fs.readFileSync(transcriptPath, "utf8").split("\n").filter(Boolean);
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
    const rel = norm(input.path);

    if (part.name === "Shell" && /Copy-Item.*members\\page/.test(input.command ?? "")) {
      members = settings;
      continue;
    }

    const target =
      rel === SETTINGS ? "settings" : rel === MEMBERS ? "members" : null;
    if (!target) continue;

    if (part.name === "Write" && input.contents) {
      if (target === "settings") settings = input.contents;
      else members = input.contents;
    } else if (part.name === "StrReplace" && input.old_string !== undefined) {
      const cur = target === "settings" ? settings : members;
      if (!cur?.includes(input.old_string)) {
        console.warn("miss", target, input.old_string.slice(0, 60));
        continue;
      }
      const next = cur.replace(input.old_string, input.new_string ?? "");
      if (target === "settings") settings = next;
      else members = next;
    }
  }
}

const final = members ?? settings;
if (!final || final.includes('redirect("/aegis/members")')) {
  console.error("Failed to reconstruct members page");
  process.exit(1);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, final, "utf8");
console.log("Wrote", outPath, final.length, "bytes");
