#!/usr/bin/env node
/**
 * P7 full-menu audit (production-style default profile):
 *   - every AEGIS_NAV page + Settings sub-pages + Cases/Reports/Access log
 *   - leftover-text scan (Northwind, USD, $, refund, stub, TODO, undefined, NaN, …)
 *   - Rules page evidence (matrix / versions / diff) and Verify (Demo Bank bundles)
 *
 * Requires: console on :3000 (default UI profile, no bank_demo), password, Playwright.
 * Usage: pnpm demo:full-menu
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = join(root, "docs", "screens", "menu");
mkdirSync(outDir, { recursive: true });

const pass = process.env.AEGIS_DEMO_APPROVAL_PASSWORD?.trim();
if (!pass || pass.length < 10) {
  console.error("Set AEGIS_DEMO_APPROVAL_PASSWORD (min 10 chars).");
  process.exit(1);
}

const base = process.env.CONSOLE_ORIGIN?.trim() || "http://localhost:3000";
const email = process.env.AEGIS_DEMO_SCREEN_USER?.trim() || "admin@demo.test";

/** Leftover / pitch-forbidden strings (case-insensitive unless noted). */
const LEFTOVERS = [
  { id: "Northwind", re: /northwind/i },
  { id: "USD", re: /\bUSD\b/ },
  { id: "dollar_sign", re: /\$\d/ },
  { id: "refund_example", re: /refund/i },
  { id: "stub", re: /\bstub\b/i },
  { id: "TODO", re: /\bTODO\b/ },
  { id: "FIXME", re: /\bFIXME\b/ },
  { id: "undefined", re: /\bundefined\b/ },
  { id: "NaN", re: /\bNaN\b/ },
  { id: "raw_error", re: /Error:\s|TypeError|Internal Server Error|ECONNREFUSED/i },
  { id: "Simulator_nav", re: /\bSimulator\b/ },
  { id: "Demo_environment_strip", re: /Demo environment,\s*synthetic data/i },
];

/**
 * Every default-nav page + Settings children the founder opens.
 * Labels match console-nav.ts AEGIS_NAV (+ settings).
 */
const PAGES = [
  ["01-overview.png", "/aegis", "Overview"],
  ["02-live-feed.png", "/aegis/live", "Live feed"],
  ["03-approvals.png", "/aegis/approvals", "Approvals"],
  ["04-rules.png", "/aegis/policies", "Rules"],
  ["05-delegations.png", "/aegis/delegations", "Delegations"],
  ["06-cases.png", "/aegis/traces", "Cases"],
  ["07-reports.png", "/aegis/reports", "Reports"],
  ["08-verify.png", "/aegis/verify", "Verify"],
  ["09-access-log.png", "/aegis/logs", "Access log"],
  ["10-agents.png", "/aegis/agents", "Agents"],
  ["11-api-keys.png", "/aegis/keys", "API keys"],
  ["12-workflows.png", "/aegis/workflows", "Workflows"],
  ["13-coverage.png", "/aegis/coverage", "Coverage"],
  ["14-incidents.png", "/aegis/incidents", "Incidents"],
  ["15-receipts.png", "/aegis/evidence", "Receipts"],
  ["16-integrations.png", "/aegis/integrations", "Integrations"],
  ["17-settings.png", "/aegis/settings", "Settings"],
  ["18-settings-profile.png", "/aegis/settings/profile", "Settings · profile"],
  ["19-settings-organization.png", "/aegis/settings/organization", "Settings · organisation"],
  ["20-settings-members.png", "/aegis/settings/members", "Settings · members"],
  ["21-settings-billing.png", "/aegis/settings/billing", "Settings · billing"],
  ["22-settings-governance.png", "/aegis/settings/governance", "Settings · governance"],
  ["23-settings-auditors.png", "/aegis/settings/auditors", "Settings · auditors"],
  ["24-settings-security.png", "/aegis/settings/security", "Settings · security"],
];

const REQUIRED_NAV = ["Rules", "Cases", "Reports", "Access log", "Delegations"];

const script = `
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const outDir = ${JSON.stringify(outDir)};
  const base = ${JSON.stringify(base)};
  const email = ${JSON.stringify(email)};
  const password = ${JSON.stringify(pass)};
  const pages = ${JSON.stringify(PAGES)};
  const leftovers = ${JSON.stringify(LEFTOVERS.map(({ id, re }) => ({ id, source: String(re) })))};
  const requiredNav = ${JSON.stringify(REQUIRED_NAV)};

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  await page.goto(base + '/login', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  const emailBox = page.locator('input[type="email"], input[name="email"]').first();
  if (await emailBox.count()) {
    await emailBox.fill(email);
    await page.locator('input[type="password"]').first().fill(password);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(/\\/aegis/, { timeout: 60000 }).catch(() => {});
  }

  await page.goto(base + '/aegis', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(800);
  const navText = await page.locator('[data-console-shell] aside, nav, [class*="sidebar"]').first().innerText().catch(() => '');
  const body0 = await page.locator('body').innerText();
  const navChecks = {
    demo_org_tag: await page.locator('[data-demo-org-tag]').count() > 0,
    no_demo_strip: await page.locator('[data-demo-strip]').count() === 0,
    no_simulator_nav: !/\\bSimulator\\b/.test(navText),
    required: Object.fromEntries(requiredNav.map((label) => [label, navText.includes(label)])),
  };
  await page.screenshot({ path: path.join(outDir, '00-production-style-overview.png'), fullPage: false });
  fs.writeFileSync(path.join(outDir, 'production-style-checks.json'), JSON.stringify({ navChecks, navSample: navText.slice(0, 800) }, null, 2));
  console.log('NAV  ' + JSON.stringify(navChecks));
  for (const [label, ok] of Object.entries(navChecks.required)) {
    console.log((ok ? 'PASS' : 'FAIL') + '  nav has ' + label);
  }

  function scan(text) {
    const hits = [];
    for (const L of leftovers) {
      const re = new RegExp(L.source.slice(1, L.source.lastIndexOf('/')), L.source.endsWith('i') || L.source.includes('/i') ? 'i' : undefined);
      // Reconstruct from serialized form: /pattern/flags
      const m = L.source.match(/^\\/(.*)\\/([a-z]*)$/);
      const rx = m ? new RegExp(m[1], m[2]) : new RegExp(L.id, 'i');
      if (rx.test(text)) hits.push(L.id);
    }
    return hits;
  }

  const results = [];
  for (const [file, route, label] of pages) {
    let status = 'ok';
    let error = '';
    let hits = [];
    try {
      const res = await page.goto(base + route, { waitUntil: 'networkidle', timeout: 60000 });
      if (res && res.status() >= 400) status = 'http_' + res.status();
      await page.waitForTimeout(700);
      const bodyText = await page.locator('body').innerText().catch(() => '');
      if (/something went wrong|application error|uncaught/i.test(bodyText)) status = 'page_error';
      hits = scan(bodyText);
      // Overview may legitimately omit Simulator from body; flag only if leftover elsewhere.
      // "Simulator" as leftover only fails when the word appears (nav or page).
      if (hits.length) status = status === 'ok' ? 'leftover' : status;
      await page.screenshot({ path: path.join(outDir, file), fullPage: false });
    } catch (err) {
      status = 'fail';
      error = String(err && err.message ? err.message : err).slice(0, 200);
    }
    results.push({ file, route, label, status, leftovers: hits, error });
    console.log((status === 'ok' ? 'PASS' : 'FAIL') + '  ' + label + '  ' + route + (hits.length ? '  leftovers=' + hits.join(',') : '') + (error ? '  ' + error : ''));
  }

  // ---- Rules: authority matrix + versions + open a diff if possible
  await page.goto(base + '/aegis/policies', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);
  const rulesEvidence = {
    authority_matrix: /authority matrix|role ladder|credit_officer|Head of Compliance/i.test(await page.locator('body').innerText()),
    version_v: /\\bv\\d+\\b/i.test(await page.locator('body').innerText()),
  };
  await page.screenshot({ path: path.join(outDir, '25-rules-matrix-versions.png'), fullPage: false });
  const whatChanged = page.getByRole('button', { name: /What changed/i }).first();
  if (await whatChanged.count()) {
    await whatChanged.click();
    await page.waitForTimeout(800);
    rulesEvidence.diff_modal = await page.getByText(/What changed|diff|compared/i).count() > 0;
    await page.screenshot({ path: path.join(outDir, '26-rules-diff.png'), fullPage: false });
    await page.keyboard.press('Escape').catch(() => {});
  } else {
    rulesEvidence.diff_modal = false;
    console.warn('Rules: no What changed button (need ≥2 versions)');
  }
  console.log('RULES  ' + JSON.stringify(rulesEvidence));

  // ---- Verify: Demo Bank sample bundles
  await page.goto(base + '/aegis/verify', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);
  const verifyText = await page.locator('body').innerText();
  const verifyEvidence = {
    has_try_bundle: /try|sample|valid|tamper|Demo Bank/i.test(verifyText),
    leftover: scan(verifyText),
  };
  await page.screenshot({ path: path.join(outDir, '27-verify-demo-bundles.png'), fullPage: false });
  console.log('VERIFY  ' + JSON.stringify(verifyEvidence));

  await browser.close();
  const summary = {
    captured_at: new Date().toISOString(),
    profile: 'default',
    page_count: results.length,
    navChecks,
    rulesEvidence,
    verifyEvidence,
    results,
  };
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(outDir, 'leftover-scan.json'), JSON.stringify({
    scanned_at: summary.captured_at,
    pages: results.map((r) => ({ route: r.route, label: r.label, status: r.status, leftovers: r.leftovers })),
  }, null, 2));

  const failed = results.filter((r) => r.status !== 'ok');
  const navFail = Object.values(navChecks.required).some((v) => !v);
  if (failed.length || navFail || !navChecks.no_simulator_nav || !navChecks.no_demo_strip) {
    console.error('\\nfull-menu failed pages=' + failed.length + ' navFail=' + navFail);
    process.exit(1);
  }
  console.log('\\nfull-menu done — ' + results.length + ' pages, leftovers clean');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
`;

const tmp = join(outDir, ".full-menu-tmp.cjs");
writeFileSync(tmp, script);
const pw = spawnSync(process.execPath, [tmp], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
  shell: false,
});
try {
  if (existsSync(tmp)) unlinkSync(tmp);
} catch {
  /* ignore */
}
process.exit(pw.status ?? 1);
