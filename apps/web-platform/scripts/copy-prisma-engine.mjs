import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appDir, "../..");
const sourceDir = path.join(repoRoot, "node_modules", ".prisma", "client");
const destDir = path.join(appDir, "generated", "prisma");

if (!existsSync(sourceDir)) {
  const message = `Prisma client not generated at ${sourceDir}. Run pnpm db:generate first.`;
  if (process.env.VERCEL === "1") {
    console.error(message);
    process.exit(1);
  }
  console.warn(message);
  process.exit(0);
}

const engines = readdirSync(sourceDir).filter((name) => name.startsWith("libquery_engine"));
if (engines.length === 0) {
  const message = `No libquery_engine binary in ${sourceDir}.`;
  if (process.env.VERCEL === "1") {
    console.error(message);
    process.exit(1);
  }
  console.warn(message);
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
for (const name of engines) {
  copyFileSync(path.join(sourceDir, name), path.join(destDir, name));
  console.log(`copied ${name}`);
}
