/**
 * Map OIDC / SSO claims to console roles and optional bank roles.
 *
 * Config (env JSON or explicit options):
 *   AEGIS_OIDC_ROLE_CLAIM=roles | groups | custom path
 *   AEGIS_OIDC_ROLE_MAP={"admin":"admin","Approver":"approver","credit_manager":"bank:credit_manager"}
 *
 * Bank roles use the `bank:` prefix in the map value.
 */

export type ConsoleRole =
  | "owner"
  | "admin"
  | "approver"
  | "auditor"
  | "engineer"
  | "viewer";

export type MappedIdentityRoles = {
  consoleRole: ConsoleRole;
  bankRoles: string[];
  matchedClaims: string[];
};

const DEFAULT_CONSOLE: ConsoleRole = "viewer";

const DEFAULT_MAP: Record<string, string> = {
  owner: "owner",
  admin: "admin",
  administrator: "admin",
  approver: "approver",
  auditor: "auditor",
  engineer: "engineer",
  viewer: "viewer",
  credit_manager: "bank:credit_manager",
  credit_officer: "bank:credit_officer",
  compliance_officer: "bank:compliance_officer",
  head_of_compliance: "bank:head_of_compliance",
  dpo: "bank:dpo",
};

function parseMap(raw: string | undefined): Record<string, string> {
  if (!raw?.trim()) return { ...DEFAULT_MAP };
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = { ...DEFAULT_MAP };
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string" && v.trim()) {
        out[k.toLowerCase()] = v.trim();
      }
    }
    return out;
  } catch {
    return { ...DEFAULT_MAP };
  }
}

function claimValues(
  claims: Record<string, unknown>,
  claimName: string,
): string[] {
  const raw = claims[claimName];
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  }
  if (Array.isArray(raw)) {
    return raw
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim());
  }
  return [];
}

const CONSOLE_RANK: ConsoleRole[] = [
  "viewer",
  "engineer",
  "auditor",
  "approver",
  "admin",
  "owner",
];

function higherConsole(a: ConsoleRole, b: ConsoleRole): ConsoleRole {
  return CONSOLE_RANK.indexOf(a) >= CONSOLE_RANK.indexOf(b) ? a : b;
}

export function mapOidcClaimsToRoles(
  claims: Record<string, unknown>,
  options?: {
    roleClaim?: string;
    roleMap?: Record<string, string>;
  },
): MappedIdentityRoles {
  const claimName =
    options?.roleClaim?.trim() ||
    process.env.AEGIS_OIDC_ROLE_CLAIM?.trim() ||
    "roles";
  const map = options?.roleMap ?? parseMap(process.env.AEGIS_OIDC_ROLE_MAP);
  const values = [
    ...claimValues(claims, claimName),
    ...claimValues(claims, "groups"),
    ...claimValues(claims, "realm_access"),
  ];
  // Keycloak-style realm_access.roles
  const realm = claims.realm_access;
  if (realm && typeof realm === "object" && !Array.isArray(realm)) {
    const roles = (realm as { roles?: unknown }).roles;
    if (Array.isArray(roles)) {
      for (const r of roles) {
        if (typeof r === "string" && r.trim()) values.push(r.trim());
      }
    }
  }

  let consoleRole: ConsoleRole = DEFAULT_CONSOLE;
  const bankRoles: string[] = [];
  const matchedClaims: string[] = [];

  for (const value of values) {
    const mapped = map[value.toLowerCase()] ?? map[value];
    if (!mapped) continue;
    matchedClaims.push(value);
    if (mapped.startsWith("bank:")) {
      bankRoles.push(mapped.slice("bank:".length));
      continue;
    }
    if (CONSOLE_RANK.includes(mapped as ConsoleRole)) {
      consoleRole = higherConsole(consoleRole, mapped as ConsoleRole);
    }
  }

  return {
    consoleRole,
    bankRoles: [...new Set(bankRoles)],
    matchedClaims: [...new Set(matchedClaims)],
  };
}
