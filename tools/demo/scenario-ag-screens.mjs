#!/usr/bin/env node
/**
 * Screenshot case pages for scenarios A–G (from docs/TEST_PACK/scenarios-ag/summary.json).
 * Usage: node tools/demo/scenario-ag-screens.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePersonaPassword } from "./load-tenant.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const summaryPath = join(root, "docs/TEST_PACK/scenarios-ag/summary.json");
const outDir = join(root, "docs/TEST_PACK/scenarios-ag/screens");
mkdirSync(outDir, { recursive: true });

if (!existsSync(summaryPath)) {
  console.error("Missing", summaryPath, "— run scenarios-ag.mjs --live first");
  process.exit(1);
}
const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
const resolved = resolvePersonaPassword(root, { preferLocal: true });
if (resolved.error) {
  console.error(resolved.error);
  process.exit(1);
}
const base =
  process.env.CONSOLE_ORIGIN?.trim() ||
  resolved.data?.console_origin?.trim() ||
  "http://127.0.0.1:3000";
const email =
  resolved.data?.personas?.admin?.email?.trim() || "admin@demo-bank.local";
const password = resolved.password;

const cases = (summary.results || [])
  .filter((r) => r.case_id && r.outcome)
  .map((r) => ({
    letter: r.letter,
    case_id: r.case_id,
    // Case page is the trace view (console_url from the simulator).
    path: `/aegis/traces/${encodeURIComponent(
      // Prefer trace_id from per-letter JSON when present
      (() => {
        try {
          const j = JSON.parse(
            readFileSync(
              join(root, `docs/TEST_PACK/scenarios-ag/scenario-${r.letter.toLowerCase()}.json`),
              "utf8",
            ),
          );
          return j.data?.trace_id || j.trace_id || r.case_id;
        } catch {
          return r.case_id;
        }
      })(),
    )}`,
  }));

const script = `
const { chromium } = require('playwright');
(async () => {
  const outDir = ${JSON.stringify(outDir)};
  const base = ${JSON.stringify(base)};
  const email = ${JSON.stringify(email)};
  const password = ${JSON.stringify(password)};
  const cases = ${JSON.stringify(cases)};
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(base + '/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  const meta = [];
  for (const c of cases) {
    const url = base + c.path;
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);
      const file = outDir + '/scenario-' + c.letter.toLowerCase() + '-case.png';
      await page.screenshot({ path: file, fullPage: true });
      meta.push({ letter: c.letter, case_id: c.case_id, url, file, ok: true });
      console.log('SHOT', c.letter, file);
    } catch (e) {
      meta.push({ letter: c.letter, case_id: c.case_id, url, ok: false, error: String(e) });
      console.error('FAIL', c.letter, e.message);
    }
  }
  require('fs').writeFileSync(outDir + '/index.json', JSON.stringify(meta, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
`;

const tmp = join(outDir, "_playwright_tmp.cjs");
writeFileSync(tmp, script);
const { spawnSync } = await import("node:child_process");
const r = spawnSync("node", [tmp], { cwd: root, encoding: "utf8", shell: true });
console.log(r.stdout);
if (r.stderr) console.error(r.stderr);
process.exit(r.status ?? 1);
