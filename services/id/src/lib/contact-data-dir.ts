import { existsSync } from "node:fs";
import path from "node:path";

export function resolveContactDataDir(startDir = process.cwd()): string {
  const fromEnv = process.env.CONTACT_DATA_DIR?.trim();
  const repoRoot = findMonorepoRoot(startDir);

  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.join(repoRoot, fromEnv.replace(/^\.\//, ""));
  }

  return path.join(repoRoot, ".data", "contact");
}

export function contactMessagesFile(startDir = process.cwd()): string {
  return path.join(resolveContactDataDir(startDir), "messages.jsonl");
}

export function contactLeadStateFile(startDir = process.cwd()): string {
  return path.join(resolveContactDataDir(startDir), "lead-state.json");
}

export function legacyContactMessageFiles(startDir = process.cwd()): string[] {
  const repoRoot = findMonorepoRoot(startDir);
  return [
    path.join(repoRoot, "apps", "web-marketing", ".data", "contact", "messages.jsonl"),
    path.join(repoRoot, ".data", "contact", "messages.jsonl"),
  ];
}

function findMonorepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 10; i += 1) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}
