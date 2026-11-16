/**
 * Bank-ready: fail if user-facing console pages still surface governed.action
 * or "Governed decision allow for case" as copy (types/filters allowed).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const consoleSrc = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../apps/web-console/src",
);

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, acc);
    } else if (/\.(tsx|ts)$/.test(name)) acc.push(p);
  }
  return acc;
}

describe("console plain language (bank_demo)", () => {
  it("pages do not show governed.action / Governed decision allow as copy", () => {
    const files = walk(join(consoleSrc, "app")).concat(
      walk(join(consoleSrc, "components")),
    );
    const offenders: string[] = [];
    for (const file of files) {
      const rel = file.replace(/\\/g, "/");
      if (rel.includes("sample-receipt.ts")) continue;
      const text = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      if (/Governed decision allow for case/.test(text)) {
        offenders.push(`${rel}: Governed decision allow for case`);
      }
      // JSX text nodes / labels — not !== "governed.action" guards
      if (/>\s*governed\.action\s*</.test(text)) {
        offenders.push(`${rel}: governed.action JSX text`);
      }
      if (/["']policy_decision:\s/.test(text)) {
        offenders.push(`${rel}: policy_decision: label`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
