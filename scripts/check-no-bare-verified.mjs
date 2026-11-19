#!/usr/bin/env node
/**
 * Wording guard (provenance Stage 2).
 *
 * Aegis proves a record is signed and unchanged. It does NOT prove the data inside the record is
 * accurate. A bare "Verified" (or "Verification failed") shown next to data content tells a reader
 * the opposite. This script fails the build when user-facing text uses the word.
 *
 * What is scanned: string literals and JSX text in
 *   - apps/web-console/src          (pages, components, copy helpers)
 *   - services/aegis-api/src        (export templates: forensic/, compliance/, routes/public, routes/console)
 * Comments, identifiers, test files and CSS are not scanned. Strings that look like identifiers
 * (receipt.verified, email_verified) are skipped.
 *
 * Allowlist: phrases below are removed from a string before it is checked, so only a leftover
 * standalone "verified" fails. Add to ALLOWLIST only for text that is NOT about data content, and
 * give a reason.
 *
 * Usage:  node scripts/check-no-bare-verified.mjs        (exit 1 on any finding)
 * Import: import { scanText, scanRepo, ALLOWLIST } from "./check-no-bare-verified.mjs"
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, "..");

/** Directories scanned, relative to the repo root. */
export const SCAN_ROOTS = [
  "apps/web-console/src",
  "services/aegis-api/src/forensic",
  "services/aegis-api/src/compliance",
  "services/aegis-api/src/routes/public",
  "services/aegis-api/src/routes/console",
];

/** Phrases that may contain the word. Each has a reason. */
export const ALLOWLIST = [
  { pattern: /verified e-?mail/gi, reason: "account email state, not data content" },
  { pattern: /e-?mail (?:is |was )?verified/gi, reason: "account email state, not data content" },
  { pattern: /callback verified/gi, reason: "a fact about a phone callback that was done, not a claim about the data" },
  { pattern: /receipt verified/gi, reason: "audit-log action label: someone ran a check" },
  { pattern: /opened, verified or downloaded/gi, reason: "audit-log filter description: what a person did" },
  { pattern: /timestamp token verified/gi, reason: "RFC 3161 token check, not data content" },
];

const BARE = /\bverified\b/i;
const SKIP_FILE = /\.(?:test|spec)\.[tj]sx?$/;
const EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js"]);

/** Remove comments. A `//` only starts a comment at the start of a line or after whitespace. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|\s)\/\/[^\n]*/g, (_m, lead) => lead);
}

/** String literals and JSX text, with the 1-based line they start on. */
function extractUserText(text) {
  const clean = stripComments(text);
  const found = [];
  const lineOf = (index) => clean.slice(0, index).split("\n").length;

  const literal = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  for (const m of clean.matchAll(literal)) {
    const value = m[1] ?? m[2] ?? m[3] ?? "";
    found.push({ value, line: lineOf(m.index ?? 0) });
  }

  const jsx = />([^<>{}]*[A-Za-z][^<>{}]*)</g;
  for (const m of clean.matchAll(jsx)) {
    found.push({ value: m[1], line: lineOf(m.index ?? 0) });
  }
  return found;
}

/** Identifier-like keys such as receipt.verified or email_verified are not user copy. */
function looksLikeIdentifier(value) {
  // word(.|_|:|/|-)word, no spaces and no trailing punctuation: "receipt.verified", not "Verified."
  return /^\w+(?:[._:/-]\w+)+$/.test(value);
}

function applyAllowlist(value, allowlist) {
  let out = value;
  for (const entry of allowlist) out = out.replace(entry.pattern, " ");
  return out;
}

/**
 * Scan one file's text. Returns [{ file, line, text }] for each user-facing string that still has
 * a standalone "verified" after the allowlist is applied.
 */
export function scanText(text, file = "<memory>", allowlist = ALLOWLIST) {
  const findings = [];
  for (const { value, line } of extractUserText(text)) {
    if (!BARE.test(value)) continue;
    if (looksLikeIdentifier(value)) continue;
    const rest = applyAllowlist(value, allowlist);
    if (BARE.test(rest)) {
      findings.push({ file, line, text: value.trim().replace(/\s+/g, " ").slice(0, 140) });
    }
  }
  return findings;
}

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".next" || name === "dist") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full);
    } else {
      const dot = name.lastIndexOf(".");
      if (dot >= 0 && EXTENSIONS.has(name.slice(dot)) && !SKIP_FILE.test(name)) yield full;
    }
  }
}

/** Scan the repo. Returns { scanned, findings }. */
export function scanRepo(root = REPO_ROOT, roots = SCAN_ROOTS) {
  const findings = [];
  let scanned = 0;
  for (const rel of roots) {
    for (const file of walk(join(root, rel))) {
      scanned += 1;
      const display = relative(root, file).split(sep).join("/");
      findings.push(...scanText(readFileSync(file, "utf8"), display));
    }
  }
  return { scanned, findings };
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const { scanned, findings } = scanRepo();
  if (findings.length > 0) {
    console.error(
      `Wording check FAILED: ${findings.length} user-facing use(s) of a standalone "verified".`,
    );
    console.error(
      'Say what was checked instead: "Record intact: signed and unchanged since <time>" for the record, ' +
        'and "Source of the data: <grade and wording>" for the data. Never imply the data is accurate.',
    );
    for (const f of findings) console.error(`  ${f.file}:${f.line}  "${f.text}"`);
    process.exit(1);
  }
  console.log(`Wording check passed: ${scanned} files scanned, no standalone "verified" next to data.`);
}
