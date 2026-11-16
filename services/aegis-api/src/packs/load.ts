import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PolicyPack } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));

export function loadPackFromJson(raw: unknown): PolicyPack {
  if (!raw || typeof raw !== "object") {
    throw new Error("pack must be a JSON object");
  }
  const p = raw as PolicyPack;
  if (!p.id || !p.name || typeof p.demo_only !== "boolean") {
    throw new Error("pack requires id, name, demo_only");
  }
  if (!Array.isArray(p.roles) || !Array.isArray(p.authority_matrix)) {
    throw new Error("pack requires roles and authority_matrix arrays");
  }
  if (typeof p.version !== "number") {
    throw new Error("pack requires numeric version");
  }
  return p;
}

/**
 * Resolve a pack.json path. Versioned folders under `src/packs/`:
 * - `_template/` — blank sector starter
 * - `insurance/` — illustrative insurance (preferred)
 * - `demo/<sector>/` — demo seeds (banking, insurance mirror)
 */
export function resolvePackJsonPath(sector: "banking" | "insurance"): string {
  const candidates = [
    // Preferred illustrative insurance pack at packs/insurance
    ...(sector === "insurance"
      ? [
          join(here, "insurance", "pack.json"),
          join(here, "..", "..", "src", "packs", "insurance", "pack.json"),
        ]
      : []),
    join(here, "demo", sector, "pack.json"),
    join(here, "..", "..", "src", "packs", "demo", sector, "pack.json"),
  ];
  const path = candidates.find((p) => existsSync(p));
  if (!path) {
    throw new Error(`pack.json not found for sector=${sector}`);
  }
  return path;
}

export function loadDemoPack(sector: "banking" | "insurance"): PolicyPack {
  const path = resolvePackJsonPath(sector);
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const pack = loadPackFromJson(raw);
  if (!pack.demo_only) {
    throw new Error(`demo pack ${pack.id} must set demo_only: true`);
  }
  return pack;
}

export function packMatrixRows(pack: PolicyPack) {
  return pack.authority_matrix.map((r, i) => ({
    matrix_id: r.matrix_id ?? `${pack.id}_mtx_${i}`,
    product: r.product,
    amount_min: r.amount_min,
    amount_max: r.amount_max,
    currency: r.currency,
    risk_tier: r.risk_tier,
    required_role: r.required_role,
    outcome: r.outcome,
    rule_code: r.rule_code,
    active: r.active !== false,
  }));
}

export function packRoles(pack: PolicyPack) {
  return pack.roles.map((r) => ({
    role_key: r.role_key,
    display_name: r.display_name,
    level: r.level,
  }));
}
