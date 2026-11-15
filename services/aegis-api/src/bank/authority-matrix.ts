/**
 * Authority matrix: product × amount band × risk → allow | hold | stop + role.
 * Role ladder supports "or above" via numeric levels.
 */

export type BankRole = {
  role_key: string;
  display_name: string;
  level: number;
};

export type AuthorityMatrixRow = {
  matrix_id: string;
  product: string;
  amount_min: number;
  amount_max: number | null;
  currency: string;
  risk_tier: string | null;
  required_role: string | null;
  outcome: "allow" | "hold" | "stop";
  rule_code: string | null;
  active: boolean;
};

export type MatrixMatch = {
  row: AuthorityMatrixRow;
  required_role: string | null;
  required_level: number | null;
  outcome: "allow" | "hold" | "stop";
};

/** Default retail_loan RWF ladder for demo bank (seed data shape). */
export const DEFAULT_RETAIL_LOAN_LADDER: BankRole[] = [
  { role_key: "credit_officer", display_name: "Credit Officer", level: 10 },
  { role_key: "credit_manager", display_name: "Credit Manager", level: 20 },
  { role_key: "compliance_officer", display_name: "Compliance Officer", level: 25 },
  { role_key: "head_of_compliance", display_name: "Head of Compliance", level: 40 },
  { role_key: "dpo", display_name: "Data Protection Officer", level: 30 },
];

/**
 * Seed rows for retail_loan in RWF (illustrative DoA used by scenarios).
 * Bands are inclusive on min, exclusive on max when max is set.
 */
export const DEFAULT_RETAIL_LOAN_MATRIX: Omit<AuthorityMatrixRow, "matrix_id">[] = [
  {
    product: "retail_loan",
    amount_min: 0,
    amount_max: 5_000_000,
    currency: "RWF",
    risk_tier: null,
    required_role: null,
    outcome: "allow",
    rule_code: "AUTH-RL",
    active: true,
  },
  {
    product: "retail_loan",
    amount_min: 5_000_000,
    amount_max: 20_000_000,
    currency: "RWF",
    risk_tier: null,
    required_role: "credit_manager",
    outcome: "hold",
    rule_code: "AUTH-RL",
    active: true,
  },
  {
    product: "retail_loan",
    amount_min: 20_000_000,
    amount_max: null,
    currency: "RWF",
    risk_tier: null,
    required_role: "credit_manager",
    outcome: "hold",
    rule_code: "AUTH-RL-HIGH",
    active: true,
  },
];

export function roleLevel(
  ladder: BankRole[],
  roleKey: string | null | undefined,
): number | null {
  if (!roleKey) return null;
  const hit = ladder.find((r) => r.role_key === roleKey);
  return hit ? hit.level : null;
}

/** True when actorRole is the required role or any role with higher level. */
export function roleSatisfies(
  ladder: BankRole[],
  actorRole: string,
  requiredRole: string,
): boolean {
  const actor = roleLevel(ladder, actorRole);
  const required = roleLevel(ladder, requiredRole);
  if (actor == null || required == null) return actorRole === requiredRole;
  return actor >= required;
}

export function matchAuthorityMatrix(
  rows: AuthorityMatrixRow[],
  input: {
    product: string;
    amount: number;
    currency: string;
    risk_tier?: string | null;
  },
  ladder: BankRole[] = [],
): MatrixMatch | null {
  const candidates = rows.filter((r) => {
    if (!r.active) return false;
    if (r.product !== input.product) return false;
    if (r.currency !== input.currency) return false;
    if (input.amount < r.amount_min) return false;
    if (r.amount_max != null && input.amount >= r.amount_max) return false;
    if (r.risk_tier != null) {
      if (!input.risk_tier || r.risk_tier !== input.risk_tier) return false;
    }
    return true;
  });

  if (candidates.length === 0) return null;

  // Most restrictive outcome wins among matches: stop > hold > allow
  const rank = (o: string) => (o === "stop" ? 3 : o === "hold" ? 2 : 1);
  candidates.sort((a, b) => rank(b.outcome) - rank(a.outcome));
  const row = candidates[0]!;
  return {
    row,
    required_role: row.required_role,
    required_level: roleLevel(ladder, row.required_role),
    outcome: row.outcome,
  };
}
