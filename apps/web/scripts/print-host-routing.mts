/**
 * Print resolveHostAction() for common host/path pairs (loads repo root `.env`).
 * Run: pnpm web:host-routing
 *
 * Expected (NODE_ENV unset/development, PUBLIC_SITE_URL=http://localhost:3000):
 *
 *   localhost:3000 /aegis          → rewrite /aegis (no cross-host redirect)
 *   localhost:3000 /aegis/pricing  → rewrite /aegis/pricing
 *   127.0.0.1:3000 /aegis          → rewrite /aegis
 *   [::1]:3000 /aegis              → rewrite /aegis
 *   aegis.localhost:3000 /         → rewrite /aegis
 *   aegis.localhost:3000 /docs     → redirect http://docs.aegis.localhost:3000/
 *   foo.localhost:3000 /            → unknown (middleware → localhost fallback)
 *   salanor.com /aegis             → redirect https://aegis.salanor.com/ (when NODE_ENV=production)
 *   evil.example.com /aegis        → unknown
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadEnvFile(path.join(repoRoot, ".env"));
loadEnvFile(path.join(repoRoot, ".env.local"));

const { resetPublicSiteCache, resolveHostAction, shouldUseLocalDevProductHosts } =
  await import("../src/lib/public-hosts.ts");

type ExpectedAction = {
  action: string;
  pathname?: string;
  location?: string;
  status?: number;
};

const cases: Array<{ host: string; pathname: string; expected: ExpectedAction }> = [
  {
    host: "localhost:3000",
    pathname: "/aegis",
    expected: { action: "rewrite", pathname: "/aegis" },
  },
  {
    host: "localhost:3000",
    pathname: "/aegis/pricing",
    expected: { action: "rewrite", pathname: "/aegis/pricing" },
  },
  {
    host: "127.0.0.1:3000",
    pathname: "/aegis",
    expected: { action: "rewrite", pathname: "/aegis" },
  },
  {
    host: "[::1]:3000",
    pathname: "/aegis",
    expected: { action: "rewrite", pathname: "/aegis" },
  },
  {
    host: "aegis.localhost:3000",
    pathname: "/",
    expected: { action: "rewrite", pathname: "/aegis" },
  },
  {
    host: "aegis.localhost:3000",
    pathname: "/docs",
    expected: { action: "redirect", location: "http://docs.aegis.localhost:3000/", status: 302 },
  },
  {
    host: "foo.localhost:3000",
    pathname: "/",
    expected: { action: "unknown" },
  },
  {
    host: "salanor.com",
    pathname: "/aegis",
    expected: { action: "redirect", location: "https://aegis.salanor.com/", status: 301 },
  },
  {
    host: "evil.example.com",
    pathname: "/aegis",
    expected: { action: "unknown" },
  },
];

function stableStringify(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as object).sort());
}

function matchesExpected(actual: ExpectedAction, expected: ExpectedAction): boolean {
  if (actual.action !== expected.action) return false;
  if (expected.pathname !== undefined && actual.pathname !== expected.pathname) return false;
  if (expected.location !== undefined && actual.location !== expected.location) return false;
  if (expected.status !== undefined && actual.status !== expected.status) return false;
  return true;
}

resetPublicSiteCache();

// Production-shaped salanor.com /aegis case
process.env.NODE_ENV = "production";
process.env.PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL ?? "https://salanor.com";
resetPublicSiteCache();

console.log("NODE_ENV:", process.env.NODE_ENV ?? "(unset)");
console.log("PUBLIC_SITE_URL:", process.env.PUBLIC_SITE_URL ?? "(unset)");
console.log("");

let failures = 0;

for (const { host, pathname, expected } of cases) {
  resetPublicSiteCache();
  const action = resolveHostAction(host, pathname);
  const localDev = shouldUseLocalDevProductHosts(host);
  const ok = matchesExpected(action as ExpectedAction, expected);

  console.log(`${host} ${pathname}`);
  console.log(`  shouldUseLocalDevProductHosts: ${localDev}`);
  console.log(`  resolveHostAction:`, JSON.stringify(action));
  console.log(`  expected:`, JSON.stringify(expected));
  console.log(`  ${ok ? "OK" : "FAIL"}`);
  console.log("");

  if (!ok) {
    failures += 1;
    console.error(
      `  mismatch: got ${stableStringify(action)} expected ${stableStringify(expected)}`,
    );
  }
}

if (failures > 0) {
  console.error(`${failures} case(s) failed`);
  process.exit(1);
}

console.log("All host-routing expectations passed.");
