#!/usr/bin/env node
/**
 * Scan console pages for leftover pitch/forbidden text and save screenshots.
 * Used by demo:full-menu; can also run alone: node tools/demo/demo-leftover-scan.mjs
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

const LEFTOVERS = [
  { id: 'Northwind', re: /northwind/i },
  { id: 'USD', re: /\\bUSD\\b/ },
  { id: 'dollar_amount', re: /\\$\\d/ },
  { id: 'refund_example', re: /\\brefund\\b/i },
  { id: 'stub', re: /\\bstub\\b/i },
  { id: 'TODO', re: /\\bTODO\\b/ },
  { id: 'FIXME', re: /\\bFIXME\\b/ },
  { id: 'undefined', re: /\\bundefined\\b/ },
  { id: 'NaN', re: /\\bNaN\\b/ },
  { id: 'raw_error', re: /Error:\\s|TypeError|Internal Server Error|ECONNREFUSED/i },
];

(async () => {
  const outDir = ${JSON.stringify(outDir)};
  const base = ${JSON.stringify(base)};
  const email = ${JSON.stringify(email)};
  const password = ${JSON.stringify(pass)};
  const pages = ${JSON.stringify(PAGES)};
  const requiredNav = ${JSON.stringify(REQUIRED_NAV)};

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  await page.goto(base + '/login', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  if (await page.locator('input[type="email"]').count()) {
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1500);
  }

  await page.goto(base + '/aegis', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(800);
  const navText = await page.locator('[data-console-shell]').innerText();
  const navChecks = {
    demo_org_tag: await page.locator('[data-demo-org-tag]').count() > 0,
    no_demo_strip: await page.locator('[data-demo-strip]').count() === 0,
    no_simulator_nav: !/\\bSimulator\\b/.test(navText.split('PRODUCTS')[0] || navText),
    required: Object.fromEntries(requiredNav.map((l) => [l, navText.includes(l)])),
  };
  await page.screenshot({ path: path.join(outDir, '00-production-style-overview.png'), fullPage: false });
  fs.writeFileSync(path.join(outDir, 'production-style-checks.json'), JSON.stringify({ navChecks }, null, 2));
  console.log('NAV', JSON.stringify(navChecks));
  for (const [label, ok] of Object.entries(navChecks.required)) {
    console.log((ok ? 'PASS' : 'FAIL') + '  nav has ' + label);
  }

  function scan(text) {
    return LEFTOVERS.filter((L) => L.re.test(text)).map((L) => L.id);
  }

  const results = [];
  for (const [file, route, label] of pages) {
    let status = 'ok';
    let error = '';
    let hits = [];
    try {
      const res = await page.goto(base + route, { waitUntil: 'networkidle', timeout: 60000 });
      if (res && res.status() >= 400) status = 'http_' + res.status();
      await page.waitForTimeout(600);
      const bodyText = await page.locator('body').innerText();
      if (/something went wrong|application error|uncaught/i.test(bodyText)) status = 'page_error';
      hits = scan(bodyText);
      if (hits.length && status === 'ok') status = 'leftover';
      await page.screenshot({ path: path.join(outDir, file), fullPage: false });
    } catch (err) {
      status = 'fail';
      error = String(err.message || err).slice(0, 200);
    }
    results.push({ file, route, label, status, leftovers: hits, error });
    console.log((status === 'ok' ? 'PASS' : 'FAIL') + '  ' + label + '  ' + route + (hits.length ? ' leftovers=' + hits.join(',') : '') + (error ? ' ' + error : ''));
  }

  // Rules evidence
  await page.goto(base + '/aegis/policies', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);
  const rulesBody = await page.locator('body').innerText();
  const rulesEvidence = {
    authority_matrix: /authority|credit_officer|Head of Compliance|role/i.test(rulesBody),
    has_v_label: /\\bv[0-9]+\\b/i.test(rulesBody),
  };
  await page.screenshot({ path: path.join(outDir, '25-rules-matrix-versions.png'), fullPage: true });
  const whatChanged = page.getByRole('button', { name: /What changed/i }).first();
  if (await whatChanged.count()) {
    await whatChanged.click();
    await page.waitForTimeout(800);
    rulesEvidence.diff_modal = true;
    await page.screenshot({ path: path.join(outDir, '26-rules-diff.png'), fullPage: false });
    await page.keyboard.press('Escape').catch(() => {});
  } else {
    rulesEvidence.diff_modal = false;
  }
  console.log('RULES', JSON.stringify(rulesEvidence));

  // Verify Demo Bank bundles
  await page.goto(base + '/aegis/verify', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  const verifyBody = await page.locator('body').innerText();
  const verifyEvidence = {
    mentions_demo_bank_or_bundle: /Demo Bank|sample|valid|tamper|Try/i.test(verifyBody),
    leftovers: scan(verifyBody),
  };
  await page.screenshot({ path: path.join(outDir, '27-verify-demo-bundles.png'), fullPage: false });
  console.log('VERIFY', JSON.stringify(verifyEvidence));

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
  const navFail = Object.values(navChecks.required).some((v) => !v) || !navChecks.no_simulator_nav || !navChecks.no_demo_strip;
  if (failed.length || navFail) {
    console.error('AUDIT_FAIL pages=' + failed.length + ' navFail=' + navFail);
    process.exit(1);
  }
  console.log('AUDIT_OK pages=' + results.length);
})().catch((e) => { console.error(e); process.exit(1); });
`;

const tmp = join(outDir, ".leftover-tmp.cjs");
writeFileSync(tmp, script);
const r = spawnSync(process.execPath, [tmp], { cwd: root, env: process.env, stdio: "inherit" });
try {
  if (existsSync(tmp)) unlinkSync(tmp);
} catch {
  /* ignore */
}
process.exit(r.status ?? 1);
