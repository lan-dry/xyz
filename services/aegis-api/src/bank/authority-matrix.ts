/**
 * Authority matrix: product × amount band × risk → allow | hold | stop + role.
 * Role ladder supports "or above" via numeric levels.
 * No sector/currency/role defaults live here — load from policy packs.
 */

export type AuthorityRole = {
  role_key: string;
  display_name: string;
  level: number;
};

/** @deprecated Use AuthorityRole — kept for call-site compatibility. */
export type BankRole = AuthorityRole;

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

export function roleLevel(
  ladder: AuthorityRole[],
  roleKey: string | null | undefined,
): number | null {
  if (!roleKey) return null;
  const hit = ladder.find((r) => r.role_key === roleKey);
  return hit ? hit.level : null;
}

/** True when actorRole is the required role or any role with higher level. */
export function roleSatisfies(
  ladder: AuthorityRole[],
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
  ladder: AuthorityRole[] = [],
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
