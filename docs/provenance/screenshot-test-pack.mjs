/**
 * Capture docs/TEST_PACK/provenance/ screenshots from the running demo.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "../TEST_PACK/provenance");
mkdirSync(outDir, { recursive: true });

const consoleOrigin = process.env.CONSOLE_ORIGIN ?? "http://127.0.0.1:3000";
const simOrigin = process.env.BANK_SIMULATOR_URL ?? "http://127.0.0.1:4000";
const email = process.env.DEMO_ADMIN_EMAIL ?? "admin@demo-bank.local";
const password = process.env.DEMO_ADMIN_PASSWORD ?? "DemoPass123!";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

async function shot(name) {
  const path = join(outDir, name);
  await page.screenshot({ path, fullPage: true });
  console.log(`wrote ${path}`);
}

async function login() {
  await page.goto(`${consoleOrigin}/login`, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForSelector('input[type="email"]', { state: "visible", timeout: 90_000 });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 60_000 }).catch(() => {});
}

await login();

const pages = [
  ["sources.png", "/aegis/sources"],
  ["exceptions.png", "/aegis/exceptions"],
  ["verify.png", "/aegis/verify"],
  ["live.png", "/aegis/live"],
];

for (const [file, path] of pages) {
  await page.goto(`${consoleOrigin}${path}`, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(1500);
  await shot(file);
}

// Cases: try first case for provenance grades
await page.goto(`${consoleOrigin}/aegis/live`, { waitUntil: "networkidle", timeout: 90_000 });
await page.waitForTimeout(1000);
const caseLink = page.locator('a[href*="/aegis/traces/"], a[href*="/aegis/cases/"], a[href*="/aegis/incidents/"]').first();
if (await caseLink.isVisible().catch(() => false)) {
  await caseLink.click();
  await page.waitForTimeout(2000);
  await shot("provenance-panel.png");
} else {
  await shot("provenance-panel-empty.png");
}

await page.goto(`${consoleOrigin}/aegis/exports`, { waitUntil: "networkidle", timeout: 90_000 }).catch(() => {});
await page.waitForTimeout(1000);
await shot("exports.png");

// Bank simulator Red Team + systems
await page.goto(simOrigin, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(1500);
await shot("systems-panel.png");
const red = page.locator("#redteamPanel");
if (await red.isVisible().catch(() => false)) {
  await red.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await shot("red-team.png");
}

await browser.close();
console.log("done");
