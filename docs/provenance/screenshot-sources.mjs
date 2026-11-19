/**
 * Capture Sources page screenshots for Stage 1 report.
 * Requires local console (:3000) and a provisioned Demo Bank admin session.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "screenshots");
mkdirSync(outDir, { recursive: true });

const consoleOrigin = process.env.CONSOLE_ORIGIN ?? "http://127.0.0.1:3000";
const email = process.env.DEMO_ADMIN_EMAIL ?? "admin@demo-bank.local";
const password = process.env.DEMO_ADMIN_PASSWORD ?? "DemoPass123!";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

async function shot(name) {
  const path = join(outDir, name);
  await page.screenshot({ path, fullPage: true });
  console.log(`wrote ${path}`);
}

await page.goto(`${consoleOrigin}/login`, { waitUntil: "networkidle", timeout: 90_000 });
await page.waitForSelector('input[type="email"]', { state: "visible", timeout: 90_000 });
await page.locator('input[type="email"]').fill(email);
await page.locator('input[type="password"]').fill(password);
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 60_000 }).catch(() => {});
await page.goto(`${consoleOrigin}/aegis/sources`, { waitUntil: "networkidle", timeout: 90_000 });
await page.waitForTimeout(2000);
await shot("sources-list.png");
if (page.url().includes("/login")) {
  await shot("sources-login-blocked.png");
  throw new Error("Still on login after sign-in; Sources screenshots incomplete");
}

async function closeModal() {
  const cancel = page.getByRole("button", { name: /cancel|close/i }).last();
  if (await cancel.isVisible().catch(() => false)) {
    await cancel.click({ force: true });
  } else {
    await page.keyboard.press("Escape");
  }
  await page.waitForSelector(".modal_overlay__hmxLY", { state: "hidden", timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(300);
}

const registerBtn = page.getByRole("button", { name: /register source/i }).first();
if (await registerBtn.isVisible().catch(() => false)) {
  await registerBtn.click();
  await page.waitForTimeout(600);
  await shot("sources-register.png");
  await closeModal();
}

const firstRow = page.locator("table tbody tr").first();
if (await firstRow.isVisible().catch(() => false)) {
  for (const [label, file] of [
    [/Replace key/i, "sources-rotate.png"],
    [/Revoke key/i, "sources-revoke.png"],
    [/Disable source/i, "sources-disable.png"],
    [/^History$/i, "sources-history.png"],
  ]) {
    const menuBtn = firstRow.locator('button[aria-haspopup="menu"]').first();
    await menuBtn.click();
    await page.waitForTimeout(400);
    const item = page.getByRole("menuitem", { name: label }).or(page.getByText(label)).first();
    if (!(await item.isVisible().catch(() => false))) {
      await page.keyboard.press("Escape");
      continue;
    }
    await item.click();
    await page.waitForTimeout(700);
    await shot(file);
    await closeModal();
  }
}

await browser.close();
console.log("done");
