/**
 * Reset local Postgres: wipe compose volume, migrate, bootstrap superadmin, pilot demo org.
 * Requires BOOTSTRAP_ADMIN_EMAIL + BOOTSTRAP_ADMIN_PASSWORD in .env (same as production path).
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnvFile() {
  for (const name of [".env.local", ".env"]) {
    const path = resolve(root, name);
    if (!existsSync(path)) continue;
    let text = readFileSync(path, "utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    for (const line of text.split(/\r?\n/)) {
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
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnvFile();

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: true, env: process.env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim();
  if (!email || !password) {
    console.error("Missing bootstrap credentials (checked .env.local and .env).");
    console.error("");
    console.error("Add to .env (uncommented, min 10 chars on password):");
    console.error("  BOOTSTRAP_ADMIN_EMAIL=you@salanor.com");
    console.error("  BOOTSTRAP_ADMIN_PASSWORD=your-long-password-here");
    process.exit(1);
  }
  if (password.length < 10) {
    console.error(
      `BOOTSTRAP_ADMIN_PASSWORD is ${password.length} characters; bootstrap requires at least 10.`,
    );
    console.error("Update .env, then re-run pnpm pilot:reset");
    process.exit(1);
  }

  console.log("== pilot:reset (destroy local DB volume) ==");
  run("docker", ["compose", "down", "-v"]);
  run("docker", ["compose", "up", "-d"]);
  console.log("Waiting for Postgres (5s)…");
  await new Promise((r) => setTimeout(r, 5000));
  run("pnpm", ["db:migrate"]);
  run("pnpm", ["db:seed:bootstrap"]);
  run("pnpm", ["db:local:pilot-fixture"]);
  console.log("\n=== RESET COMPLETE ===");
  console.log("Sign in: BOOTSTRAP_ADMIN_EMAIL + password on :3003 and :3000 (salanor-platform).");
  console.log("Next: pnpm dev   (in one terminal)");
  console.log("      pnpm pilot:agent   (in another, after dev is up)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
