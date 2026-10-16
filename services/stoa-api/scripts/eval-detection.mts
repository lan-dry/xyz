/**
 * Measures what reaches the AI provider for every labelled test message.
 *
 *   npx tsx scripts/eval-detection.mts [--detector http://127.0.0.1:8095] [--file path] [--verbose]
 *
 * A sensitive value counts as protected only if no identifying piece of it is
 * left in the text sent upstream. A "keep" value (amounts, dates, places) must
 * survive untouched, otherwise the AI can't do the work.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { redactPrompt, type DetectedSpan } from "../src/dlp/redact.js";
import { entitiesToSpans, fetchDetectorEntities } from "../src/dlp/detector.js";
import { MODEL_GROUPS, type ModelGroup } from "../src/dlp/patterns.js";

type Labelled = {
  id: string;
  lang: string;
  text: string;
  sensitive: { value: string; type: string }[];
  keep: string[];
};

const args = process.argv.slice(2);
const argValue = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const verbose = args.includes("--verbose");
const file =
  argValue("--file") ??
  fileURLToPath(new URL("../../pii-detector/eval/bank-messages.jsonl", import.meta.url));
const detectorUrl = argValue("--detector") ?? "http://127.0.0.1:8095";

const rows: Labelled[] = readFileSync(file, "utf8")
  .split(/\r?\n/)
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line) as Labelled);

const problems: string[] = [];
const ids = new Set<string>();
for (const row of rows) {
  if (ids.has(row.id)) problems.push(`${row.id}: duplicate id`);
  ids.add(row.id);
  for (const s of row.sensitive) {
    if (!row.text.includes(s.value)) problems.push(`${row.id}: sensitive "${s.value}" not in text`);
  }
  for (const k of row.keep) {
    if (!row.text.includes(k)) problems.push(`${row.id}: keep "${k}" not in text`);
    for (const s of row.sensitive) {
      if (s.value.includes(k) || k.includes(s.value)) {
        problems.push(`${row.id}: keep "${k}" overlaps sensitive "${s.value}"`);
      }
    }
  }
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}

const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const compact = (s: string) => fold(s).replace(/[^a-z0-9]/g, "");
const hasWord = (haystack: string, word: string) =>
  new RegExp(
    `(?<![\\p{L}\\p{N}])${fold(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`,
    "u",
  ).test(fold(haystack));

const TITLES = new Set(["mr", "mrs", "mme", "mlle", "dr", "mami"]);
/** Words that don't identify anyone on their own. */
const GENERIC = new Set([
  "rue", "avenue", "ave", "street", "st", "near", "opposite", "behind", "after", "hotel",
  "station", "total", "gate", "blue", "bakery", "public", "school",
  "kigali", "kimironko", "kacyiru", "nyarugenge", "nyabugogo", "remora", "remera",
  "kiyovu", "gikondo", "kimihurura", "nyarutarama", "paris", "france",
]);
const NUMERIC = new Set(["phone", "account_number", "iban", "payment_card", "national_id"]);

function leftover(upstream: string, item: { value: string; type: string }): string | null {
  if (fold(upstream).includes(fold(item.value))) return item.value;
  if (NUMERIC.has(item.type)) {
    return compact(upstream).includes(compact(item.value)) ? item.value : null;
  }
  if (item.type === "person" || item.type === "address") {
    const parts = item.value.split(/[\s,'’-]+/).filter((p) => p.length >= 3);
    for (const part of parts) {
      const f = fold(part);
      if (TITLES.has(f) || GENERIC.has(f) || /^\d+$/.test(part) && item.type === "person") continue;
      if (item.type === "address" && /^\d{1,3}$/.test(part)) continue;
      if (hasWord(upstream, part)) return part;
    }
  }
  return null;
}

type Outcome = {
  byType: Map<string, { total: number; protected: number }>;
  leaks: string[];
  keepTotal: number;
  keepLost: string[];
  falseFlags: number;
};

function score(results: { row: Labelled; upstream: string; spans?: DetectedSpan[] }[]): Outcome {
  const out: Outcome = { byType: new Map(), leaks: [], keepTotal: 0, keepLost: [], falseFlags: 0 };
  for (const { row, upstream, spans } of results) {
    for (const item of row.sensitive) {
      const t = out.byType.get(item.type) ?? { total: 0, protected: 0 };
      t.total += 1;
      const left = leftover(upstream, item);
      if (left === null) t.protected += 1;
      else out.leaks.push(`${row.id}  ${item.type.padEnd(15)} "${item.value}"${left !== item.value ? `  (left: "${left}")` : ""}`);
      out.byType.set(item.type, t);
    }
    for (const k of row.keep) {
      out.keepTotal += 1;
      if (!upstream.includes(k)) out.keepLost.push(`${row.id}  "${k}"`);
    }
    const labelled = row.sensitive.flatMap((s) => {
      const ranges: [number, number][] = [];
      let from = 0;
      for (;;) {
        const at = row.text.indexOf(s.value, from);
        if (at < 0) break;
        ranges.push([at, at + s.value.length]);
        from = at + 1;
      }
      return ranges;
    });
    for (const span of spans ?? []) {
      if (!labelled.some(([a, b]) => span.start < b && span.end > a)) out.falseFlags += 1;
    }
  }
  return out;
}

function report(title: string, o: Outcome) {
  const totals = [...o.byType.values()].reduce(
    (acc, t) => ({ total: acc.total + t.total, protected: acc.protected + t.protected }),
    { total: 0, protected: 0 },
  );
  const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "n/a");
  console.log(`\n=== ${title} ===`);
  console.log(`Sensitive values protected: ${totals.protected}/${totals.total} (${pct(totals.protected, totals.total)})`);
  console.log(`Values that must stay, kept: ${o.keepTotal - o.keepLost.length}/${o.keepTotal} (${pct(o.keepTotal - o.keepLost.length, o.keepTotal)})`);
  for (const [type, t] of [...o.byType.entries()].sort()) {
    console.log(`  ${type.padEnd(15)} ${String(t.protected).padStart(3)}/${String(t.total).padEnd(3)} ${pct(t.protected, t.total)}`);
  }
  if (o.falseFlags) console.log(`  model flags on unlabelled text: ${o.falseFlags}`);
  if (verbose || o.leaks.length <= 40) {
    if (o.leaks.length) console.log(`\n  Reached the AI:\n    ${o.leaks.join("\n    ")}`);
  }
  if (o.keepLost.length) console.log(`\n  Wrongly hidden:\n    ${o.keepLost.join("\n    ")}`);
}

const baseOptions = { profile: "financial" as const };

report(
  `Patterns only (${rows.length} messages)`,
  score(rows.map((row) => ({ row, upstream: redactPrompt(row.text, baseOptions).text }))),
);

let raw: Awaited<ReturnType<typeof fetchDetectorEntities>>[] | null = null;
try {
  const started = Date.now();
  raw = [];
  for (const row of rows) {
    raw.push(await fetchDetectorEntities(row.text, { url: detectorUrl, timeoutMs: 60_000, threshold: 0.2 }));
  }
  console.log(`\nDetector: ${rows.length} messages in ${Date.now() - started} ms`);
} catch (error) {
  console.log(`\nDetector at ${detectorUrl} unavailable (${(error as Error).message}); skipped.`);
  raw = null;
}

if (raw) {
  const detected = raw;
  const run = (threshold: Record<ModelGroup, number>) =>
    score(
      rows.map((row, i) => {
        const spans = entitiesToSpans(detected[i]!, threshold);
        return { row, spans, upstream: redactPrompt(row.text, { ...baseOptions, detected: spans }).text };
      }),
    );

  console.log("\n=== Threshold sweep (patterns + model) ===");
  console.log("  threshold  person  address  dob   all     kept    false flags");
  for (const t of [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) {
    const o = run(Object.fromEntries(MODEL_GROUPS.map((g) => [g, t])) as Record<ModelGroup, number>);
    const cell = (type: string) => {
      const v = o.byType.get(type);
      return v ? `${v.protected}/${v.total}` : "-";
    };
    const all = [...o.byType.values()].reduce((a, v) => [a[0]! + v.protected, a[1]! + v.total], [0, 0]);
    console.log(
      `  ${t.toFixed(1).padEnd(10)} ${cell("person").padEnd(7)} ${cell("address").padEnd(8)} ${cell("date_of_birth").padEnd(5)} ${`${all[0]}/${all[1]}`.padEnd(7)} ${`${o.keepTotal - o.keepLost.length}/${o.keepTotal}`.padEnd(7)} ${o.falseFlags}`,
    );
  }

  const chosen = Number(argValue("--threshold") ?? 0.5);
  report(
    `Patterns + model at threshold ${chosen}`,
    run(Object.fromEntries(MODEL_GROUPS.map((g) => [g, chosen])) as Record<ModelGroup, number>),
  );
}
