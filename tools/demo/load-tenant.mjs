/**
 * Shared reader for gitignored Demo Bank tenant files.
 * Persona passwords live in the tenant JSON (provisioning), not in AEGIS_DEMO_APPROVAL_PASSWORD.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const LOCAL_STACK_TENANT = ".demo-tenant-local-stack.local.json";
export const HOSTED_TENANT = ".demo-tenant-emails.local.json";

/**
 * @param {string} root repo root
 * @param {{ preferLocal?: boolean }} [opts]
 * @returns {{ path: string, data: Record<string, unknown> } | null}
 */
export function loadTenantFile(root, opts = {}) {
  const preferLocal = opts.preferLocal !== false;
  const candidates = [
    process.env.DEMO_TENANT_FILE?.trim(),
    preferLocal ? join(root, LOCAL_STACK_TENANT) : null,
    join(root, HOSTED_TENANT),
    !preferLocal ? join(root, LOCAL_STACK_TENANT) : null,
  ].filter(Boolean);

  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      let raw = readFileSync(p, "utf8");
      if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
      return { path: p, data: JSON.parse(raw) };
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * @param {Record<string, unknown> | null | undefined} data
 * @param {string} [personaKey]
 * @returns {string}
 */
export function personaPasswordFromTenant(data, personaKey = "admin") {
  const personas = data?.personas;
  if (!personas || typeof personas !== "object") return "";
  const entry = /** @type {Record<string, { password?: string }> } */ (personas)[personaKey];
  const pass = entry?.password?.trim() ?? "";
  return pass.length >= 10 ? pass : "";
}

/**
 * Resolve a demo sign-in password from the provisioning tenant file only.
 * @param {string} root
 * @param {{ persona?: string, preferLocal?: boolean }} [opts]
 */
export function resolvePersonaPassword(root, opts = {}) {
  const loaded = loadTenantFile(root, { preferLocal: opts.preferLocal });
  if (!loaded) {
    return {
      password: "",
      source: null,
      error:
        "No tenant file found. Run pnpm demo:up (writes .demo-tenant-local-stack.local.json) " +
        "or set DEMO_TENANT_FILE to a provisioning JSON with personas.*.password.",
    };
  }
  const password = personaPasswordFromTenant(loaded.data, opts.persona ?? "admin");
  if (!password) {
    return {
      password: "",
      source: loaded.path,
      error: `${loaded.path} has no personas.${opts.persona ?? "admin"}.password (min 10 chars).`,
    };
  }
  return { password, source: loaded.path, error: null, data: loaded.data };
}
