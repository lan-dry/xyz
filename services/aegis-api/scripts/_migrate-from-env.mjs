/**
 * Run aegis migrate using MIGRATION_DATABASE_URL || DATABASE_URL_UNPOOLED from repo .env.
 * Prints hosts only, never secrets.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

function loadEnv(path) {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [
          l.slice(0, i).trim(),
          l.slice(i + 1).trim().replace(/^["']|["']$/g, ""),
        ];
      }),
  );
}

const root = resolve(import.meta.dirname, "../../..");
const fileEnv = loadEnv(resolve(root, ".env"));
const migrationUrl =
  fileEnv.MIGRATION_DATABASE_URL || fileEnv.DATABASE_URL_UNPOOLED;
if (!migrationUrl) {
  console.error("Need MIGRATION_DATABASE_URL or DATABASE_URL_UNPOOLED in .env");
  process.exit(1);
}
const u = new URL(migrationUrl);
console.log(
  `migrate target host=${u.hostname} db=${u.pathname} user=${u.username}`,
);

const env = {
  ...process.env,
  ...fileEnv,
  MIGRATION_DATABASE_URL: migrationUrl,
  DATABASE_URL: migrationUrl,
};

const r = spawnSync(
  "pnpm",
  ["--filter", "aegis-api", "exec", "node", "dist/db/migrate-cli.js"],
  { cwd: root, env, encoding: "utf8", shell: true },
);
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);

if (r.status !== 0) {
  console.log("dist migrate failed; trying tsx/src path via package script");
  const r2 = spawnSync("pnpm", ["db:migrate"], {
    cwd: root,
    env,
    encoding: "utf8",
    shell: true,
  });
  if (r2.stdout) process.stdout.write(r2.stdout);
  if (r2.stderr) process.stderr.write(r2.stderr);
  process.exit(r2.status ?? 1);
}
process.exit(0);
