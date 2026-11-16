/**
 * Product surface must not name real institutions.
 * Customer-specific outreach decks live under docs/presentations/ and are excluded.
 * Demo / synthetic names are allow-listed (they may appear in seed/demo code).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(fileURLToPath(import.meta.url), "../../..");

/** Real institution names that must not appear in product code/docs. */
const FORBIDDEN = [
  "Bank of Kigali",
  "Banque de Kigali",
  "Equity Bank",
  "KCB Bank",
  "I&M Bank",
  "Access Bank",
  "GTBank",
  "Ecobank",
  "Absa",
  "Standard Bank",
  "FNB Rwanda",
  "Cogebanque",
  "BPR Bank",
  "NCBA",
  "Urwego",
];

/**
 * Synthetic / demo names that are allowed on the product surface
 * (seed CLIs, Demo Bank fixture, docs). Not real customers.
 */
const DEMO_ALLOWLIST = [
  "Northwind",
  "Northwind Payments",
  "Demo Bank",
  "demo-bank",
  "Meridian",
  "salanor-platform",
  "Patience Ingabire",
] as const;

const SCAN_ROOTS = [
  "services/aegis-api/src",
  "services/aegis-api/test",
  "services/aegis-api/openapi",
  "packages",
  "sdks",
  "apps/web-console",
  "apps/web-marketing/src",
  "tools/aegis-verify",
  "tools/bench",
  "examples",
  "docs/DEMO.md",
  "docs/GAP_REPORT.md",
  "docs/DECISIONS.md",
  "docs/FINAL_REPORT.md",
  "docs/INTEGRATION_GUIDE.md",
  "docs/WEBSITE_CHANGES.md",
  "docs/THREAT_MODEL.md",
  "docs/baselines",
];

const EXCLUDE_DIR_NAMES = new Set([
  "node_modules",
  "dist",
  ".next",
  "coverage",
  "presentations",
]);

const TEXT_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".mts",
  ".json",
  ".md",
  ".yaml",
  ".yml",
  ".css",
  ".sql",
]);

function walk(path: string, out: string[]): void {
  let st;
  try {
    st = statSync(path);
  } catch {
    return;
  }
  if (st.isFile()) {
    out.push(path);
    return;
  }
  if (!st.isDirectory()) return;
  const base = path.split(/[/\\]/).pop() ?? "";
  if (EXCLUDE_DIR_NAMES.has(base)) return;
  for (const name of readdirSync(path)) {
    if (EXCLUDE_DIR_NAMES.has(name)) continue;
    walk(join(path, name), out);
  }
}

function isTextFile(path: string): boolean {
  const lower = path.toLowerCase();
  for (const ext of TEXT_EXT) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

describe("no real institution names in product surface", () => {
  it("greps code and product docs for forbidden institution names", () => {
    const files: string[] = [];
    for (const rel of SCAN_ROOTS) {
      walk(join(root, rel), files);
    }
    const hits: Array<{ file: string; name: string }> = [];
    for (const file of files) {
      if (!isTextFile(file)) continue;
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      for (const name of FORBIDDEN) {
        if (text.includes(name)) {
          hits.push({
            file: relative(root, file).split(sep).join("/"),
            name,
          });
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("documents demo allow-list (synthetic names are not forbidden)", () => {
    expect(DEMO_ALLOWLIST.length).toBeGreaterThan(0);
    expect(FORBIDDEN.some((n) => DEMO_ALLOWLIST.includes(n as never))).toBe(
      false,
    );
  });
});
