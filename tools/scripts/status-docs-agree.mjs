#!/usr/bin/env node
/**
 * Fails if status docs disagree across files OR contradict themselves.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const paths = {
  FINAL: join(root, "docs/FINAL_REPORT.md"),
  GAP: join(root, "docs/GAP_REPORT.md"),
  DEMO: join(root, "docs/DEMO.md"),
  WEB: join(root, "docs/WEBSITE_CHANGES.md"),
};

const texts = {};
let failed = 0;
for (const [name, p] of Object.entries(paths)) {
  if (!existsSync(p)) {
    console.error(`MISSING ${name}`);
    failed++;
    continue;
  }
  texts[name] = readFileSync(p, "utf8");
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed++;
}
function ok(msg) {
  console.log(`OK ${msg}`);
}

// --- Cross-doc: website must not claim live publish Done ---
for (const [name, text] of Object.entries(texts)) {
  if (/live publish[^\n]{0,80}\*\*Done\*\*/i.test(text)) {
    fail(`${name}: claims website live publish Done`);
  }
}
const publishOk =
  /not (done|publish)|do not publish|no live publish|awaiting founder/i.test(
    Object.values(texts).join("\n"),
  );
if (!publishOk) fail("Website live publish honesty marker missing");
else ok("website live publish = not done / preview only");

const requiredMentions = [
  "approvals=http",
  "demo:up",
  "escalate",
  "export:scenario-bundles",
  "AEGIS_DEMO_APPROVAL_PASSWORD",
];
for (const phrase of requiredMentions) {
  const missing = ["FINAL", "GAP", "DEMO"].filter(
    (d) => texts[d] && !texts[d].toLowerCase().includes(phrase.toLowerCase()),
  );
  const soft =
    phrase === "AEGIS_DEMO_APPROVAL_PASSWORD"
      ? missing.filter((d) => d !== "GAP")
      : missing;
  if (soft.length) fail(`missing "${phrase}" in: ${soft.join(",")}`);
  else ok(`mention: ${phrase}`);
}

// --- Intra-doc contradictions in FINAL_REPORT ---
const final = texts.FINAL ?? "";

/** Extract §9 status for an item id prefix like "1.1" or "2.4". */
function section9Status(id) {
  const re = new RegExp(
    `\\|\\s*${id.replace(".", "\\.")}[^|]*\\|\\s*\\*\\*(Done|Partial|Not done)\\*\\*`,
    "i",
  );
  const m = final.match(re);
  return m ? m[1].toLowerCase() : null;
}

const s91_1 = section9Status("1\\.1");
const s92_4 = section9Status("2\\.4");
const s92_3 = section9Status("2\\.3");
const s92_5 = section9Status("2\\.5");

// §2 must not call scenarios 4–7 "Fixture only" if §9 1.1 claims Done for HTTP live path,
// and must not claim universal Done without receipt_kind proof language.
if (/## 2\./.test(final)) {
  const sec2 = final.split(/## 2\./)[1]?.split(/## 3\./)[0] ?? "";
  if (
    /\| 4 \|[^\n]*Fixture only/i.test(sec2) &&
    /1\.1[^\n]*\*\*Done\*\*/i.test(final)
  ) {
    fail(
      "FINAL §2 calls scenario 4 Fixture only while §9 marks 1.1 Done — reconcile",
    );
  }
  if (
    /\| 12 \|[^\n]*In-memory/i.test(sec2) &&
    /1\.1[^\n]*\*\*Done\*\*/i.test(final) &&
    !/Partial/i.test(final.match(/\| 1\.1[^\n]+/)?.[0] ?? "")
  ) {
    fail(
      "FINAL §2 still says scenario 12 in-memory while §9 1.1 is Done without Partial",
    );
  }
  ok("checked §2 vs §9 scenario claims");
}

// §3 / §4 vs §9
if (/## 3\./.test(final)) {
  const sec3 = final.split(/## 3\./)[1]?.split(/## 4\./)[0] ?? "";
  if (
    /Backup\/restore[^\n]*\*\*Not done\*\*/i.test(sec3) &&
    s92_4 === "done"
  ) {
    fail("FINAL §3 Backup/restore Not done vs §9 2.4 Done");
  }
  if (/OIDC[^\n]*Doc only/i.test(sec3) && s92_3 === "done") {
    fail("FINAL §3 OIDC Doc only vs §9 2.3 Done");
  }
  if (/Canned reports[^\n]*Stub UI/i.test(sec3) && /reports[^\n]*Real canned/i.test(final)) {
    fail("FINAL §3 Canned reports Stub UI vs §8 Real canned");
  }
  ok("checked §3 vs §9");
}

if (/## 4\./.test(final)) {
  const sec4 = final.split(/## 4\./)[1]?.split(/## 5\./)[0] ?? "";
  // Any §9 item id referenced in §4 (e.g. **1.1**, 2.4) must not be Done in §9.
  const idRefs = [
    ...sec4.matchAll(/\*\*(\d+\.\d+)\*\*/g),
    ...sec4.matchAll(/(?:^|\n)\s*\d+\.\s+\*\*(\d+\.\d+)\*\*/g),
  ].map((m) => m[1]);
  for (const id of new Set(idRefs)) {
    const st = section9Status(id);
    if (st === "done") {
      fail(
        `FINAL §4 still lists ${id} as not done while §9 marks Done`,
      );
    }
  }
  // Legacy phrase checks (also catch Done items without bold ids).
  const stillLists = [
    [/Backup → restore|Backup\/restore drill/i, s92_4 === "done", "2.4 backup"],
    [/OIDC claim/i, s92_3 === "done", "2.3 OIDC"],
    [/Webhook retry/i, s92_5 === "done", "2.5 webhook"],
    [/Escalation to a role|scenario 10 HTTP/i, section9Status("1.3") === "done", "1.3 escalate"],
    [/Time-bound delegation/i, section9Status("1.3") === "done", "1.3 delegation"],
    [/demo:rehearse green|1\.2.*rehearse/i, section9Status("1.2") === "done", "1.2 rehearse"],
    [/Scenarios 3,\s*8|receipt_kind=none|1\.1.*FAIL/i, section9Status("1.1") === "done", "1.1 live sealed"],
    [/Expand `--approvals=http` beyond scenario 2/i, true, "http beyond 2"],
  ];
  for (const [re, isDone, label] of stillLists) {
    if (re.test(sec4) && isDone) {
      fail(`FINAL §4 still lists "${label}" as not done while §9 says Done`);
    }
  }
  ok("checked §4 vs §9");
}

// §9 1.1: if Done must cite paste; Partial is required when §2 still has FAIL rows
const row11 = final.match(/\| 1\.1[^\n]+/);
if (row11) {
  const row = row11[0];
  const sec2 = final.split(/## 2\./)[1]?.split(/## 3\./)[0] ?? "";
  const hasFail = /FAIL scenario/i.test(sec2);
  if (/\*\*Done\*\*/i.test(row) && hasFail) {
    fail("§9 1.1 Done while §2 still contains FAIL scenario lines");
  } else if (
    /\*\*Done\*\*/i.test(row) &&
    !/pasted|raw|receipt_kind|§2/i.test(row)
  ) {
    fail("§9 1.1 Done without proof language");
  } else {
    ok("§9 1.1 status language");
  }
}

// ---------------------------------------------------------------------------
// Intra-GAP contradictions: one requirement must not be "Missing" / "Not done"
// in one row and "Present" / "Done" in another (or in the same row).
// ---------------------------------------------------------------------------
const gap = texts.GAP ?? "";
const POSITIVE = /\b(Present|Done|Corrected)\b/i;
const NEGATIVE = /\b(Missing|Not done|Doc only)\b|\bnot (?:yet )?(?:done|implemented|generated)\b/i;
const gapRows = gap
  .split(/\r?\n/)
  .map((line, i) => ({ line: line.trim(), n: i + 1 }))
  .filter(
    ({ line }) =>
      line.startsWith("|") && !/^\|[\s:|-]+\|?$/.test(line) && !/^\|\s*(ID|Item|Area|Phase|Path|Surface)\s*\|/i.test(line),
  );

/** topic = a requirement that the GAP report talks about in several tables. */
const gapTopics = [
  { name: "R4.5 escalation", match: /R4\.5|escalat/i },
  { name: "R4.6 delegation", match: /R4\.6|delegat/i },
  { name: "Backup / restore", match: /backup/i },
  { name: "OIDC role mapping", match: /OIDC/i },
  {
    name: "Stub UI (reports)",
    match: /canned|reports?\b/i,
    // "stub" counts as a limitation only when it describes the reports UI;
    // "stub label removed" and "bank-core stub" are fine.
    negative: /\bstub\s+(?:UI|page|reports)\b|\*\*Stub\*\*|console\s+Stub\b|\(stub UI\)/i,
  },
];

for (const topic of gapTopics) {
  const neg = topic.negative ?? NEGATIVE;
  const hits = gapRows.filter(({ line }) => topic.match.test(line));
  const negRows = hits.filter(({ line }) => neg.test(line));
  const posRows = hits.filter(({ line }) => POSITIVE.test(line));
  if (negRows.length && posRows.length) {
    const cite = (rows) => rows.map((r) => `GAP:${r.n}`).join(", ");
    fail(
      `GAP_REPORT contradicts itself on "${topic.name}": negative at ${cite(negRows)} vs Present/Done at ${cite(posRows)}`,
    );
  } else {
    ok(`GAP_REPORT consistent on "${topic.name}" (${hits.length} rows)`);
  }
}

// The GAP report must not call the reports page a stub if FINAL says it is real.
if (/reports[^\n]*Real canned/i.test(final) && /\bstub reports\b|\*\*Stub\*\* page|Stub UI/i.test(gap)) {
  fail("GAP_REPORT still labels the reports UI a stub while FINAL §8 says it is real");
} else {
  ok("GAP reports-UI label agrees with FINAL §8");
}

// GAP must not mark a bank item Present/Done that FINAL §9 still calls Partial / Not done, for the
// ids both documents name directly.
const gapVsFinal = [
  { label: "backup/restore", finalId: "2\\.4", gap: /Backup\/restore \+ verify[^\n]*\*\*(Done|Not done)\*\*/i },
  { label: "OIDC role mapping", finalId: "2\\.3", gap: /OIDC role mapping[^\n]*\*\*(Done|Partial)\*\*/i },
];
for (const g of gapVsFinal) {
  const m = gap.match(g.gap);
  const fin = section9Status(g.finalId);
  if (m && fin && m[1].toLowerCase() !== fin) {
    fail(`GAP "${g.label}" is ${m[1]} but FINAL §9 ${g.finalId.replace("\\", "")} is ${fin}`);
  } else {
    ok(`GAP vs FINAL §9: ${g.label}`);
  }
}

// ---------------------------------------------------------------------------
// Bank-ready table vs screens on disk (Pass 2 completion notes).
//   Done      -> every screen file the row cites must exist and be non-empty.
//   Partial   -> not allowed when the row has a real test AND all its cited
//                screens exist (it would be understating finished work).
// "Partial — reason" rows with no test ("—") or no screen cited stay Partial.
// ---------------------------------------------------------------------------
{
  const failedBefore = failed;
  const start = final.indexOf("### Bank-ready item status");
  const end = final.indexOf("\n### ", start + 5);
  const block = start >= 0 ? final.slice(start, end > start ? end : undefined) : "";
  if (!block) {
    fail("FINAL_REPORT has no 'Bank-ready item status' section");
  } else {
    const rows = block
      .split(/\r?\n/)
      .filter((l) => /^\|\s*(\d+\.\d+|[A-Z]\d*)\s/.test(l) && !/^\|\s*Item\s*\|/i.test(l));
    let checked = 0;
    for (const row of rows) {
      const cells = row.split("|").slice(1, -1).map((c) => c.trim());
      const [item, statusCell, tests = "", proof = ""] = cells;
      const status = /^done\b/i.test(statusCell) ? "done" : /^partial\b/i.test(statusCell) ? "partial" : "other";
      const pngs = [...proof.matchAll(/`(docs\/screens\/[^`]+\.png)`/g)].map((m) => m[1]);
      const missing = pngs.filter((p) => {
        const abs = join(root, p);
        return !existsSync(abs) || statSync(abs).size === 0;
      });
      const hasTest = tests && tests !== "—" && tests !== "-";
      checked++;
      if (status === "done" && missing.length) {
        fail(`FINAL bank-ready "${item}" is Done but screens are missing: ${missing.join(", ")}`);
      } else if (status === "partial" && pngs.length && !missing.length && hasTest) {
        fail(
          `FINAL bank-ready "${item}" is Partial although its test (${tests}) and all ${pngs.length} screens exist — mark Done or name the missing proof`,
        );
      } else if (status === "other") {
        fail(`FINAL bank-ready "${item}" has unreadable status "${statusCell}"`);
      }
    }
    // Pass 2 note must exist and must not contradict the table.
    const pass2Pending = /pass 2[^\n]*stay Partial[^\n]*until[^\n]*screens exist/i.test(block);
    const screensDir = join(root, "docs/screens");
    const runbookDir = join(screensDir, "runbook");
    const haveScreens =
      existsSync(runbookDir) && readdirSync(runbookDir).some((f) => f.endsWith(".png")) &&
      readdirSync(screensDir).some((f) => f.endsWith(".png"));
    if (pass2Pending && haveScreens) {
      fail("FINAL bank-ready note says items stay Partial until screens exist, but docs/screens/ already has them");
    }
    if (haveScreens && !/pass 2 completion/i.test(block)) {
      fail("FINAL bank-ready section has no 'Pass 2 completion' note although docs/screens/ has screens");
    }
    if (/Capture checklist only/i.test(final) && haveScreens) {
      fail("FINAL §8 still says screens are a capture checklist only");
    }
    if (failed === failedBefore) ok(`FINAL bank-ready table vs docs/screens (${checked} rows)`);
  }
}

// ---------------------------------------------------------------------------
// DEMO.md must carry the P10 truth statements.
// ---------------------------------------------------------------------------
{
  const demo = texts.DEMO ?? "";
  const section = demo.split(/^## P10 truth statements/m)[1]?.split(/^## /m)[0] ?? "";
  const needs = [
    ["key custody", /key custody/i, /KMS/i, /interim/i],
    ["public TSA / no SLA", /RFC 3161|time authority/i, /no SLA/i],
    ["hosting region placeholder", /HOSTING_REGION/],
    ["SOC 2 / EU AI Act mapping only", /SOC 2/i, /EU AI Act/i, /mapping/i],
    ["no latency SLA", /no latency SLA/i],
    ["no FedRAMP / HIPAA", /FedRAMP/i, /HIPAA/i],
  ];
  if (!section) fail("DEMO.md has no 'P10 truth statements' section");
  else {
    for (const [label, ...res] of needs) {
      if (res.every((re) => re.test(section))) ok(`DEMO P10: ${label}`);
      else fail(`DEMO P10 truth statements missing: ${label}`);
    }
  }
}

console.log(
  failed === 0
    ? "status-docs-agree: PASS"
    : `status-docs-agree: FAIL (${failed})`,
);
process.exit(failed > 0 ? 1 : 0);
