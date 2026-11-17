#!/usr/bin/env node
/**
 * Automated console checks (no Simulator nav; key empty states present).
 * Requires: console on :3000 and a provisioning tenant file (pnpm demo:up).
 *
 * Usage: pnpm demo:console-check
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePersonaPassword } from "./load-tenant.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = join(root, ".cursor-test-compare", "remove-demo-mode");
mkdirSync(outDir, { recursive: true });

const resolved = resolvePersonaPassword(root, { preferLocal: true });
if (resolved.error) {
  console.error(resolved.error);
  process.exit(1);
}
const password = resolved.password;
const base =
  process.env.CONSOLE_ORIGIN?.trim() ||
  resolved.data?.console_origin?.trim() ||
  "http://localhost:3000";
const email =
  process.env.AEGIS_DEMO_SCREEN_USER?.trim() ||
  resolved.data?.personas?.admin?.email?.trim() ||
  "admin@demo.test";

const REQUIRED_NAV = ["Overview", "Live feed", "Approvals", "Rules", "Delegations", "Cases", "Reports", "Access log"];
const FORBIDDEN_NAV = ["Simulator"];

/** Pages that should expose a known empty-state title when the list is empty. */
const EMPTY_STATE_PAGES = [
  { route: "/aegis/workflows", expect: /No workflows yet/i },
  { route: "/aegis/incidents", expect: /No incidents yet/i },
  { route: "/aegis/keys", expect: /No API keys yet/i },
  { route: "/aegis/delegations", expect: /No delegations yet/i },
];

const script = `
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const outDir = ${JSON.stringify(outDir)};
  const base = ${JSON.stringify(base)};
  const email = ${JSON.stringify(email)};
  const password = ${JSON.stringify(password)};
  const requiredNav = ${JSON.stringify(REQUIRED_NAV)};
  const forbiddenNav = ${JSON.stringify(FORBIDDEN_NAV)};
  const emptyPages = ${JSON.stringify(
    EMPTY_STATE_PAGES.map((p) => ({ route: p.route, expectSource: p.expect.source, expectFlags: p.expect.flags })),
  )};

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
  const navText = await page.locator('[data-console-shell]').innerText().catch(async () => page.locator('body').innerText());
  const navPrimary = navText.split('PRODUCTS')[0] || navText;

  const checks = [];
  for (const label of requiredNav) {
    const ok = navPrimary.includes(label);
    checks.push({ id: 'nav_has_' + label, ok });
    console.log((ok ? 'PASS' : 'FAIL') + '  nav has ' + label);
  }
  for (const label of forbiddenNav) {
    const ok = !new RegExp('\\\\b' + label + '\\\\b').test(navPrimary);
    checks.push({ id: 'nav_no_' + label, ok });
    console.log((ok ? 'PASS' : 'FAIL') + '  nav has no ' + label);
  }

  for (const ep of emptyPages) {
    await page.goto(base + ep.route, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(600);
    const body = await page.locator('body').innerText();
    const re = new RegExp(ep.expectSource, ep.expectFlags);
    // Empty state is required only when the page is not populated with rows.
    const hasRows = /\\b(active|pending|open)\\b/i.test(body) && body.split('\\n').length > 40;
    const ok = re.test(body) || hasRows;
    checks.push({ id: 'empty_or_populated_' + ep.route, ok, detail: re.test(body) ? 'empty_state' : hasRows ? 'populated' : 'missing' });
    console.log((ok ? 'PASS' : 'FAIL') + '  ' + ep.route + ' (' + (re.test(body) ? 'empty_state' : hasRows ? 'populated' : 'missing') + ')');
  }

  await browser.close();
  const summary = {
    captured_at: new Date().toISOString(),
    base,
    email,
    checks,
  };
  fs.writeFileSync(path.join(outDir, 'console-check.txt'), checks.map((c) => (c.ok ? 'PASS' : 'FAIL') + '  ' + c.id + (c.detail ? '  ' + c.detail : '')).join('\\n') + '\\n');
  fs.writeFileSync(path.join(outDir, 'console-check.json'), JSON.stringify(summary, null, 2));
  if (checks.some((c) => !c.ok)) {
    console.error('CONSOLE_CHECK_FAIL');
    process.exit(1);
  }
  console.log('CONSOLE_CHECK_OK');
})().catch((e) => { console.error(e); process.exit(1); });
`;

const tmp = join(outDir, ".console-check-tmp.cjs");
writeFileSync(tmp, script);
const r = spawnSync(process.execPath, [tmp], { cwd: root, env: process.env, stdio: "inherit" });
try {
  if (existsSync(tmp)) unlinkSync(tmp);
} catch {
  /* ignore */
}
process.exit(r.status ?? 1);
