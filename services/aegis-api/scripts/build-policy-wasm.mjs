/**
 * Build policy/policy.wasm from policy/rego/default.rego (requires Docker + opa image).
 */
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const policyDir = join(root, "policy");
const rego = join(policyDir, "rego", "default.rego");
const bundleTar = join(policyDir, "bundle.tar.gz");
const wasmOut = join(policyDir, "policy.wasm");

if (!existsSync(rego)) {
  console.error("Missing", rego);
  process.exit(1);
}

execSync(
  `docker run --rm -v "${policyDir.replace(/\\/g, "/")}:/policy" openpolicyagent/opa:0.70.0 build -t wasm -e aegis/decision /policy/rego/default.rego -o /policy/bundle.tar.gz`,
  { stdio: "inherit" },
);

execSync(`tar -xf "${bundleTar}" -C "${policyDir}" policy.wasm`, {
  stdio: "inherit",
  shell: true,
});

rmSync(bundleTar, { force: true });
console.log("Wrote", wasmOut);
