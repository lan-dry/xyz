#!/usr/bin/env node
/**
 * Capture Demo Bank console screenshots into docs/screens/.
 * Requires: demo:up (console on :3000), Playwright, and a tenant file with persona passwords.
 * The simulator is a standalone app (tools/bank-simulator), not a console page, so it has no shot here.
 *
 * Two passes, both written as 1920x1080 images:
 *   zoom 1    : viewport 1920x1080 @ deviceScaleFactor 1
 *   zoom 125% : viewport 1536x864  @ deviceScaleFactor 1.25
 * The second pass is what Chrome does at 125% browser zoom: the layout is 1536 CSS px
 * wide, so it genuinely reflows. (Setting document.body.style.zoom does not survive
 * page.goto, which is why earlier "zoom" images were byte-identical to the 100% ones.)
 *
 * After capture, every zoom-125 file is hashed against its zoom-1 twin. If any pair is
 * identical the script exits non-zero: the zoom pass did nothing.
 *
 * Usage: pnpm demo:screens
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePersonaPassword } from "./load-tenant.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = join(root, "docs", "screens");
mkdirSync(outDir, { recursive: true });

const resolved = resolvePersonaPassword(root, { preferLocal: true });
if (resolved.error) {
  console.error(resolved.error);
  process.exit(1);
}
const pass = resolved.password;

const base = process.env.CONSOLE_ORIGIN?.trim() || "http://localhost:3000";
const email =
  process.env.AEGIS_DEMO_SCREEN_USER?.trim() ||
  resolved.data?.personas?.admin?.email?.trim() ||
  "admin@demo.test";

/** [file, path]. A path of "@first-case" opens the first case linked from the live feed. */
const SHOTS = [
  ["01-overview.png", "/aegis"],
  ["02-live-feed.png", "/aegis/live"],
  ["03-approvals.png", "/aegis/approvals"],
  ["04-rules.png", "/aegis/policies"],
  ["05-delegations.png", "/aegis/delegations"],
  ["06-verify.png", "/aegis/verify"],
  ["07-reports.png", "/aegis/reports"],
  ["08-access-log.png", "/aegis/logs"],
  ["09-case-four-answers.png", "@first-case"],
  ["10-case-replay.png", "@first-case-replay"],
  ["11-evidence.png", "/aegis/evidence"],
];

/** Output size for both passes. */
const PASSES = [
  { name: "zoom1", suffix: "", viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  {
    name: "zoom125",
    suffix: "-zoom125",
    viewport: { width: 1536, height: 864 },
    deviceScaleFactor: 1.25,
  },
];

const script = `
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const outDir = ${JSON.stringify(outDir)};
  const base = ${JSON.stringify(base)};
  const email = ${JSON.stringify(email)};
  const password = ${JSON.stringify(pass)};
  const shots = ${JSON.stringify(SHOTS)};
  const passes = ${JSON.stringify(PASSES)};

  const browser = await chromium.launch({ headless: true });

  async function firstCasePath(page) {
    await page.goto(base + '/aegis/live', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    const href = await page
      .locator('a[href*="/aegis/traces/"]')
      .first()
      .getAttribute('href', { timeout: 8000 })
      .catch(() => null);
    return href ? href.split('?')[0] : null;
  }

  async function capture(p) {
    const context = await browser.newContext({
      viewport: p.viewport,
      deviceScaleFactor: p.deviceScaleFactor,
    });
    const page = await context.newPage();
    await page.goto(base + '/login', { waitUntil: 'networkidle' }).catch(() => page.goto(base + '/aegis'));
    const emailSel = 'input[type="email"], input[name="email"]';
    if (await page.locator(emailSel).count()) {
      await page.fill(emailSel, email);
      await page.fill('input[type="password"]', password);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(1500);
    }
    // Real layout width check: proves the pass reflowed rather than scaled.
    const innerWidth = await page.evaluate(() => window.innerWidth);
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    console.log(p.name + ': innerWidth=' + innerWidth + ' devicePixelRatio=' + dpr);

    const casePath = await firstCasePath(page);
    for (const [name, pathName] of shots) {
      let target = pathName;
      if (pathName === '@first-case') target = casePath;
      if (pathName === '@first-case-replay') target = casePath ? casePath + '/replay' : null;
      if (!target) {
        console.warn('skip ' + name + ' (no case on the live feed; run pilot:seed-history)');
        continue;
      }
      await page.goto(base + target, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(800);
      const file = path.join(outDir, name.replace('.png', p.suffix + '.png'));
      await page.screenshot({ path: file, fullPage: false });
      console.log('wrote', file);
    }
    await context.close();
  }

  for (const p of passes) await capture(p);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
`;

const tmp = join(root, "tools", "demo", ".demo-screens-tmp.cjs");
writeFileSync(tmp, script);

// Install playwright in tools if missing (best effort)
if (!existsSync(join(root, "node_modules", "playwright"))) {
  console.log("Installing playwright (one-time)...");
  const r = spawnSync("pnpm", ["add", "-wD", "playwright"], {
    cwd: root,
    shell: true,
    stdio: "inherit",
  });
  if (r.status !== 0) {
    console.error(
      "Could not install playwright. Run: pnpm add -wD playwright && npx playwright install chromium",
    );
    process.exit(1);
  }
  spawnSync("npx", ["playwright", "install", "chromium"], {
    cwd: root,
    shell: true,
    stdio: "inherit",
  });
}

const run = spawnSync("node", [tmp], { cwd: root, shell: true, stdio: "inherit" });
try {
  unlinkSync(tmp);
} catch {
  /* ignore */
}
if ((run.status ?? 1) !== 0) process.exit(run.status ?? 1);

// Zoom must be real: no 125% image may be byte-identical to its 100% twin.
function sha(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}
const identical = [];
let compared = 0;
for (const [name] of SHOTS) {
  const one = join(outDir, name);
  const zoomed = join(outDir, name.replace(".png", "-zoom125.png"));
  if (!existsSync(one) || !existsSync(zoomed)) continue;
  compared += 1;
  if (sha(one) === sha(zoomed)) identical.push(name);
}
if (compared === 0) {
  console.error("Zoom check: no image pairs to compare.");
  process.exit(1);
}
if (identical.length > 0) {
  console.error(
    `Zoom check FAILED: these zoom-125 images are identical to the 100% ones (zoom did nothing):\n  ${identical.join("\n  ")}`,
  );
  process.exit(1);
}
console.log(`Zoom check OK: ${compared} zoom-125 images differ from their 100% twins.`);
